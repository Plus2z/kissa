/**
 * OSC 133 流式标注器(增强层旁路)——阶段二扩展。
 *
 * 依赖 shell 集成:会话 shell 通过 PROMPT_COMMAND / PS0 / PS1 输出 FinalTerm 风格的
 * OSC 133 转义序列,标记命令生命周期的四个阶段:
 *
 *   OSC 133;A;<cwd>   提示符开始(shell 每次绘制提示符前发出,携带当前目录)
 *   OSC 133;B         命令输入区开始(提示符结束,此后到 C 之间是回显的命令文本)
 *   OSC 133;C         命令开始执行(此后到 D 之间是命令输出)
 *   OSC 133;D;<exit>  命令结束,携带退出码
 *
 * 阶段二新增的三项旁路标注:
 *   1. 全屏程序:检测备用屏缓冲区转义序列(ESC[?1049/1047/47 h|l),进出各发一次事件
 *   2. \r 行折叠:进度条类输出(单行反复 \r 重写)只保留最终态,不再逐次成行
 *   3. 等待输入:命令运行中输出静默 + 行尾无换行 + 提示符特征(冒号/问号/关键词),
 *      发 input_request 事件;有新输出或命令结束时发 input_request_end
 *
 * 标注器绝不修改、过滤原始字节;任何异常只降级增强气泡,不影响真相层。
 */

import { parseDiff, parseJson } from './structured.js'

/** 标注器产出的事件,由会话层转成协议消息发出 */
export type AnnotatorEvent =
  | { kind: 'cwd'; cwd: string }
  | { kind: 'command_start'; commandId: string; text: string; cwd: string | null; startedAt: number }
  | { kind: 'output'; commandId: string; content: string }
  | { kind: 'command_end'; commandId: string; exitCode: number | null; durationMs: number }
  | { kind: 'fullscreen'; commandId: string | null; status: 'active' | 'exited' }
  | { kind: 'input_request'; commandId: string; mode: 'password' | 'confirm' | 'text'; prompt: string }
  | { kind: 'input_request_end'; commandId: string }
  | { kind: 'structured'; commandId: string; view: 'diff' | 'json'; data: unknown }

/** 输出快照的软上限:超过后气泡内容截断并附加提示,防御 cat /dev/urandom 类场景 */
const MAX_OUTPUT_CHARS = 200_000

/** 输出静默多久后判定"疑似等待输入" */
const INPUT_SILENCE_MS = 600

const OSC133_RE = /\x1b\]133;(A|B|C|D)(?:;([^\x07\x1b]*))?(?:\x07|\x1b\\)/g

/**
 * 已知 TUI/全屏程序名单。备用屏检测覆盖不了两类程序:
 *   1. 内联 TUI(claude/codex 等 AI CLI 在主屏反复重绘,不发 1049)
 *   2. 启动期备用屏抖动的 TUI(agy/antigravity:先 1049h 又 1049l 再内联渲染)
 * 对名单程序按"命令期间锁定全屏态"处理,不受备用屏反复切换影响。
 * 名单参考 2026 年主流 AI 编码 CLI 盘点(dev.to / awesome-cli-coding-agents)。
 */
const TUI_PROGRAMS = new Set([
  // 传统全屏程序(多数也走备用屏,名单作兜底)
  'vim', 'nvim', 'vi', 'nano', 'emacs', 'less', 'more', 'most', 'man',
  'top', 'htop', 'btop', 'glances', 'k9s', 'lazygit', 'lazydocker',
  'tmux', 'screen',
  // AI CLI / 内联 TUI
  'claude', 'claude-code', 'codex', 'gemini', 'aider', 'chatgpt', 'qwen', 'iflow',
  'agy', 'antigravity', // Google Antigravity(备用屏抖动,正是宽限机制的起因)
  'opencode', 'goose', 'amp', 'q', 'kiro', // OpenCode / Block Goose / Sourcegraph Amp / Amazon Q / Kiro
  'cursor-agent', 'copilot', 'kimi', 'openclaw', 'crush', 'openhands', 'droid',
])

/** 远程 shell 程序:SSH/mosh 走对话视图(远程提示符切分),不再全屏锁定 */
const REMOTE_SHELLS = new Set(['ssh', 'mosh'])

/**
 * 远程 shell 提示符(SSH 对话视图适配):形如 user@host:~$ / user@host:~# /
 * [user@host ~]$ / root@server:/# 等;命令回显可能紧随提示符同行
 * ("user@host:~$ ls"),捕获组 1 为提示符后的命令文本(可能为空)。
 * 带 \r 回显与颜色转义,剥离后按行匹配。
 */
const REMOTE_PROMPT_RE = /^[\w.-]+@[\w.-]+[: ][^\n]*?[#$%>] ?(.*)$/

/** 提取命令行实际调用的程序名:穿透 sudo/env/nohup 等前缀与 VAR=val,去路径 */
function invokedProgram(cmdline: string): string {
  const skip = new Set(['sudo', 'env', 'nohup', 'command', 'exec', 'time', 'nice'])
  for (const t of cmdline.trim().split(/\s+/)) {
    if (skip.has(t)) continue
    if (t.includes('=')) continue
    if (t.length === 0) continue
    return t.split('/').pop()!.toLowerCase()
  }
  return ''
}

type Phase = 'prompt' | 'echo' | 'output'

export function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g, '')
    .replace(/\x1b[PX^_][\s\S]*?\x1b\\/g, '')
    .replace(/\x1b[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
}

/** \r 行内折叠:进度条式重写("50%\r75%")只保留每行最后一个非空段 */
function collapseCr(s: string): string {
  return s
    .split('\n')
    .map((line) => {
      const parts = line.split('\r')
      for (let i = parts.length - 1; i >= 0; i--) {
        if (parts[i].length > 0) return parts[i]
      }
      return ''
    })
    .join('\n')
}

/** 标注用途的输出渲染:折叠 \r → 剥离 ANSI */
function renderForAnnotation(raw: string): string {
  return stripAnsi(collapseCr(raw))
}

/** 根据提示文本猜测输入类型;返回 null 表示不像在等待输入 */
function classifyPrompt(line: string): { mode: 'password' | 'confirm' | 'text' } | null {
  const l = line.trimEnd()
  if (l.length === 0) return null
  if (/password|passphrase|密码/i.test(l)) return { mode: 'password' }
  if (/\(y\/n\)|\[y\/n\]|\[Y\/N\]|\(yes\/no\)|\[yes\/no\]|\(Y\/N\)/i.test(l)) return { mode: 'confirm' }
  // 通用提示符特征:以冒号/问号(半全角)结尾
  if (/[:?::?]$/.test(l)) return { mode: 'text' }
  return null
}

export class Osc133Annotator {
  private carry = ''
  private phase: Phase = 'prompt'
  private lastCwd: string | null = null
  private echoBuf = ''
  private outBuf = ''
  private outDirty = false
  private commandId: string | null = null
  private startedAt = 0
  private seq = 0
  private lastFlush = 0

  // 全屏状态:备用屏序列 ∪ TUI 名单,合并后按边沿发事件
  private altScreen = false
  private tuiListed = false
  private fsEmitted = false
  /** 退出宽限定时器:TUI 启动期备用屏抖动(1049h→1049l→1049h)不应触发误退出 */
  private fsGraceTimer: ReturnType<typeof setTimeout> | null = null

  // 等待输入状态
  private lastDataAt = 0
  private awaiting = false
  private timer: ReturnType<typeof setInterval> | null = null

  // 远程 shell(SSH/mosh)对话模式:提示符切分远程命令/输出成独立气泡
  private remoteMode = false
  /** pre=连接过程(横幅/密码,进本地输出气泡);idle=等命令回显;out=收集输出 */
  private remoteStage: 'pre' | 'idle' | 'out' = 'pre'
  private remoteCmdId: string | null = null
  private remoteCmdStartedAt = 0
  private remoteOutBuf = ''
  private remoteLineBuf = ''

  // 当前命令文本(结构化检测用)
  private lastCommandText = ''

  constructor(
    private onEvent: (ev: AnnotatorEvent) => void,
    private fallbackText?: () => string | null,
  ) {
    // 低频巡检:静默 + 提示符特征 → input_request
    this.timer = setInterval(() => this.tick(), Math.max(150, INPUT_SILENCE_MS / 2))
    this.timer.unref?.()
  }

  /** 喂入一段 PTY 原始输出(已是 UTF-8 解码后的字符串;不修改,只做旁路分析) */
  write(chunk: string): void {
    this.buf += chunk
    this.process()
  }

  /** PTY 退出时收尾:若仍有活动命令,补一个 command_end */
  close(exitCode: number | null): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (this.fsGraceTimer) {
      clearTimeout(this.fsGraceTimer)
      this.fsGraceTimer = null
    }
    if (this.awaiting && this.commandId !== null) {
      this.onEvent({ kind: 'input_request_end', commandId: this.commandId })
      this.awaiting = false
    }
    if (this.tuiListed || this.altScreen) {
      this.tuiListed = false
      this.altScreen = false
      this.emitFullscreenEdge(true)
    }
    if (this.remoteMode) {
      this.endRemoteCommand()
      this.remoteMode = false
    }
    this.flushOutput(true)
    if (this.commandId !== null) {
      this.onEvent({
        kind: 'command_end',
        commandId: this.commandId,
        exitCode,
        durationMs: Date.now() - this.startedAt,
      })
      this.commandId = null
    }
  }

  private buf = ''

  /** 备用屏扫描游标(已扫描到的 buf 位置);回看 8 字符容纳跨 chunk 的序列 */
  private altScanPos = 0

  private process(): void {
    OSC133_RE.lastIndex = 0
    let handled = 0
    let m: RegExpExecArray | null
    while ((m = OSC133_RE.exec(this.buf)) !== null) {
      const text = this.buf.slice(handled, m.index)
      this.routeText(text)
      this.handleMarker(m[1]!, m[2])
      handled = OSC133_RE.lastIndex
    }
    // 备用屏序列扫描:扫整个缓冲(含 carry 区),游标+回看防重复/防漏跨界序列
    const scanFrom = Math.max(0, this.altScanPos - 8)
    this.scanAltScreen(this.buf.slice(scanFrom))
    this.altScanPos = this.buf.length

    // 尾部可能是被 chunk 边界截断的半截转义序列:从最近一个可能的 ESC 起保留到下轮
    // (只影响文本路由;上面的序列扫描不受 carry 影响,完整序列即时处理)
    let keep = this.buf.length
    for (let i = Math.max(handled, this.buf.length - 64); i < this.buf.length; i++) {
      if (this.buf[i] !== '\x1b') continue
      if (this.remoteMode) {
        // 远程 shell:提示符检测需要即时看到完整文本,不能因颜色序列(\x1b[00m)
        // 被 carry 而看不到提示符;只保留疑似 OSC133/备用屏的半截序列
        const rest = this.buf.slice(i)
        if (rest.startsWith('\x1b]133') || rest.startsWith('\x1b[?')) {
          keep = i
          break
        }
        continue
      }
      keep = i
      break
    }
    const tail = this.buf.slice(handled, keep)
    this.routeText(tail)
    this.buf = this.buf.slice(keep)
    this.altScanPos = Math.max(0, this.altScanPos - keep)
    // 防御:carry 异常增长(如二进制输出里大量孤立 ESC)时强制放行(序列已扫过,无需重扫)
    if (this.buf.length > 4096) {
      this.routeText(this.buf)
      this.buf = ''
      this.altScanPos = 0
    }
    this.flushOutput(false)
  }

  /** 备用屏进出检测:按序处理文本中的全部序列(全局正则,状态边沿去重) */
  private scanAltScreen(text: string): void {
    if (text.length === 0) return
    const re = /\x1b\[\?(?:1049|1047|47)([hl])/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const want = m[1] === 'h'
      if (want === this.altScreen) continue
      this.altScreen = want
      this.emitFullscreenEdge()
      if (!want) {
        // 退出全屏后通常紧跟提示符;补一次强制输出刷新,避免气泡卡在半屏内容
        this.flushOutput(true)
      }
    }
  }

  /** 全屏态(备用屏 ∪ 名单)变化时发事件;退出带 400ms 宽限(防抖动),force 用于命令结束 */
  private emitFullscreenEdge(force = false): void {
    const active = this.altScreen || this.tuiListed
    if (active === this.fsEmitted) {
      // 状态回到已发出的值:取消挂起的宽限退出
      if (this.fsGraceTimer) {
        clearTimeout(this.fsGraceTimer)
        this.fsGraceTimer = null
      }
      return
    }
    if (active) {
      if (this.fsGraceTimer) {
        clearTimeout(this.fsGraceTimer)
        this.fsGraceTimer = null
      }
      this.fsEmitted = true
      this.onEvent({ kind: 'fullscreen', commandId: this.commandId, status: 'active' })
      return
    }
    // → 退出:宽限 400ms,期间备用屏若重新进入则取消
    if (force) {
      if (this.fsGraceTimer) {
        clearTimeout(this.fsGraceTimer)
        this.fsGraceTimer = null
      }
      this.fsEmitted = false
      this.onEvent({ kind: 'fullscreen', commandId: this.commandId, status: 'exited' })
      return
    }
    if (this.fsGraceTimer) return
    this.fsGraceTimer = setTimeout(() => {
      this.fsGraceTimer = null
      const nowActive = this.altScreen || this.tuiListed
      if (nowActive === this.fsEmitted) return
      this.fsEmitted = nowActive
      this.onEvent({ kind: 'fullscreen', commandId: this.commandId, status: 'exited' })
    }, 400)
    this.fsGraceTimer.unref?.()
  }

  private handleMarker(marker: string, param: string | undefined): void {
    switch (marker) {
      case 'A': {
        this.echoBuf = ''
        this.phase = 'prompt'
        if (param && param.length > 0) {
          this.lastCwd = param
          this.onEvent({ kind: 'cwd', cwd: param })
        }
        break
      }
      case 'B':
        this.phase = 'echo'
        this.echoBuf = ''
        break
      case 'C': {
        // 命令开始:回显区文本即命令文本;为空时回退到聊天路径提供的文本
        this.flushOutput(true)
        const echoed = stripAnsi(this.echoBuf).replace(/\n+$/, '').trim()
        const text = echoed || this.fallbackText?.()?.trim() || ''
        this.echoBuf = ''
        this.phase = 'output'
        this.outBuf = ''
        this.awaiting = false
        this.lastDataAt = Date.now()
        this.lastCommandText = text
        if (text.length > 0) {
          this.commandId = `cmd-${++this.seq}`
          this.startedAt = Date.now()
          this.onEvent({
            kind: 'command_start',
            commandId: this.commandId,
            text,
            cwd: this.lastCwd,
            startedAt: this.startedAt,
          })
          // TUI 名单命中(claude/codex 等内联 TUI):命令期间视为全屏态
          this.tuiListed = TUI_PROGRAMS.has(invokedProgram(text))
          this.emitFullscreenEdge()
          // SSH/mosh:进入远程 shell 对话模式(提示符切分命令/输出,不再全屏锁定)
          this.remoteMode = REMOTE_SHELLS.has(invokedProgram(text))
          if (this.remoteMode) {
            this.remoteStage = 'pre'
            this.remoteCmdId = null
            this.remoteOutBuf = ''
            this.remoteLineBuf = ''
          }
        } else {
          this.commandId = null
        }
        break
      }
      case 'D': {
        this.endAwaiting()
        // 远程 shell 结束:收尾未结束的远程命令
        if (this.remoteMode) {
          this.endRemoteCommand()
          this.remoteMode = false
        }
        this.flushOutput(true)
        // 命令结束:屏幕交还 shell,备用屏若仍挂着(程序崩溃没发 1049l)一并收敛
        this.altScreen = false
        this.tuiListed = false
        this.emitFullscreenEdge(true)
        if (this.commandId !== null) {
          // 结构化增强:git diff / 纯 JSON;失败静默降级为纯文本
          this.detectStructured()
          const ec = param !== undefined && /^\d+$/.test(param) ? Number(param) : null
          this.onEvent({
            kind: 'command_end',
            commandId: this.commandId,
            exitCode: ec,
            durationMs: Date.now() - this.startedAt,
          })
          this.commandId = null
        }
        this.phase = 'prompt'
        break
      }
    }
  }

  private routeText(text: string): void {
    if (text.length === 0) return
    if (this.phase === 'echo') this.echoBuf += text
    else if (this.phase === 'output') {
      if (this.remoteMode) {
        // 远程 shell:连接过程(pre,横幅/密码)进本地输出气泡,
        // 交互阶段由远程命令/输出气泡呈现(不再重复进本地输出)
        const wasPre = this.remoteStage === 'pre'
        this.handleRemote(text)
        if (wasPre && this.remoteStage === 'pre') {
          this.outBuf += text
          this.outDirty = true
          this.lastDataAt = Date.now()
          if (this.awaiting && this.commandId !== null) {
            this.awaiting = false
            this.onEvent({ kind: 'input_request_end', commandId: this.commandId })
          }
        }
        return
      }
      this.outBuf += text
      this.outDirty = true
      this.lastDataAt = Date.now()
      // 等待中来了新输出:先结束上一轮输入请求(前端收起组件)
      if (this.awaiting && this.commandId !== null) {
        this.awaiting = false
        this.onEvent({ kind: 'input_request_end', commandId: this.commandId })
      }
    }
    // prompt 阶段的文本(提示符本身)不需要标注
  }

  private endAwaiting(): void {
    if (this.awaiting && this.commandId !== null) {
      this.awaiting = false
      this.onEvent({ kind: 'input_request_end', commandId: this.commandId })
    }
  }

  /* ---- 远程 shell(SSH/mosh)对话模式 ---- */

  /** 远程输出按行处理(跨 chunk 行缓冲),提示符切分命令边界 */
  private handleRemote(text: string): void {
    this.remoteLineBuf += text
    let nl: number
    while ((nl = this.remoteLineBuf.indexOf('\n')) >= 0) {
      const line = this.remoteLineBuf.slice(0, nl)
      this.remoteLineBuf = this.remoteLineBuf.slice(nl + 1)
      this.processRemoteLine(line)
    }
    // 关键:提示符通常不带换行(光标停在提示符后)。若当前尾部已构成完整提示符
    // 且无命令跟随(用户刚敲完命令、shell 回到提示符),立即结束上一远程命令——
    // 否则命令输出会憋到下一条命令输入时才 flush,气泡一直"运行中"
    const tail = stripAnsi(this.remoteLineBuf).replace(/\r$/, '').trimEnd()
    if (tail.length > 0) {
      const m = tail.match(REMOTE_PROMPT_RE)
      if (m && (m[1] ?? '') === '') {
        this.remoteLineBuf = ''
        if (this.remoteStage === 'out' || this.remoteCmdId) this.endRemoteCommand()
        this.remoteStage = 'idle'
      }
    }
    // 防御:无换行的超长缓冲(异常输出)强制放行
    if (this.remoteLineBuf.length > 8192) this.remoteLineBuf = ''
  }

  private processRemoteLine(raw: string): void {
    const line = stripAnsi(raw).replace(/\r$/, '').trimEnd()
    const m = line.match(REMOTE_PROMPT_RE)
    if (m) {
      // 提示符:结束上一远程命令,进入 idle;命令回显可能同行跟随
      const cmd = (m[1] ?? '').trim()
      if (this.remoteStage === 'out' || this.remoteCmdId) this.endRemoteCommand()
      this.remoteStage = 'idle'
      if (cmd.length > 0) this.startRemoteCommand(cmd)
      return
    }
    if (this.remoteStage === 'pre') return // 登录横幅/连接过程,由本地输出气泡呈现
    if (this.remoteStage === 'idle') {
      if (line.length === 0) return
      // 提示符后单独成行的用户输入(回显)也是远程命令
      this.startRemoteCommand(line)
      return
    }
    // out:收集输出
    this.remoteOutBuf += (this.remoteOutBuf.length > 0 ? '\n' : '') + line
  }

  /** 开始一个远程命令气泡(回显文本即命令文本) */
  private startRemoteCommand(text: string): void {
    this.remoteStage = 'out'
    this.remoteCmdId = `r-${++this.seq}`
    this.remoteCmdStartedAt = Date.now()
    this.onEvent({
      kind: 'command_start',
      commandId: this.remoteCmdId,
      text,
      cwd: null,
      startedAt: this.remoteCmdStartedAt,
    })
  }

  /** 远程命令收尾:输出 + command_end(退出码远程拿不到,记 null) */
  private endRemoteCommand(): void {
    if (this.remoteCmdId === null) return
    if (this.remoteOutBuf.length > 0) {
      this.onEvent({ kind: 'output', commandId: this.remoteCmdId, content: this.remoteOutBuf })
    }
    this.onEvent({
      kind: 'command_end',
      commandId: this.remoteCmdId,
      exitCode: null,
      durationMs: Date.now() - this.remoteCmdStartedAt,
    })
    this.remoteCmdId = null
    this.remoteOutBuf = ''
  }

  /** 巡检:远程输出节流 flush + 命令运行中、输出静默、行尾无换行且像提示符 → input_request */
  private tick(): void {
    // 远程命令进行中:节流推送输出快照(长任务也能流式看到内容,而非憋到提示符)
    if (
      this.remoteMode &&
      this.remoteStage === 'out' &&
      this.remoteCmdId !== null &&
      this.remoteOutBuf.length > 0
    ) {
      this.onEvent({ kind: 'output', commandId: this.remoteCmdId, content: this.remoteOutBuf })
    }
    // 远程 shell 交互阶段(idle/out)由远程命令/输出气泡呈现,关闭输入请求探测;
    // 连接阶段(pre,密码提示)仍需要它
    if (this.remoteMode && this.remoteStage !== 'pre') return
    if (
      this.phase !== 'output' ||
      this.commandId === null ||
      this.awaiting ||
      this.outBuf.length === 0
    ) {
      return
    }
    if (Date.now() - this.lastDataAt < INPUT_SILENCE_MS) return
    const rendered = renderForAnnotation(this.outBuf)
    if (rendered.endsWith('\n') || rendered.length === 0) return
    const lastLine = rendered.slice(rendered.lastIndexOf('\n') + 1)
    const cls = classifyPrompt(lastLine)
    if (!cls) return
    this.awaiting = true
    this.onEvent({
      kind: 'input_request',
      commandId: this.commandId,
      mode: cls.mode,
      prompt: lastLine.trim().slice(-200),
    })
  }

  /** 命令结束时尝试结构化解析(diff / JSON),供气泡渲染增强视图 */
  private detectStructured(): void {
    if (this.commandId === null || this.outBuf.length === 0) return
    const rendered = renderForAnnotation(this.outBuf)
    try {
      if (rendered.startsWith('diff --git ') || /^git\s+(diff|show|log\s+-p)\b/.test(this.lastCommandText)) {
        const d = parseDiff(rendered)
        if (d) {
          this.onEvent({ kind: 'structured', commandId: this.commandId, view: 'diff', data: d })
          return
        }
      }
      const j = parseJson(rendered)
      if (j !== null) {
        this.onEvent({ kind: 'structured', commandId: this.commandId, view: 'json', data: j })
      }
    } catch {
      /* 解析异常:保持纯文本 */
    }
  }

  /** 输出快照按 80ms 节流推送;结束/切命令时强制推送 */
  private flushOutput(force: boolean): void {
    if (!this.outDirty || this.commandId === null) return
    const now = Date.now()
    if (!force && now - this.lastFlush < 80) return
    this.lastFlush = now
    this.outDirty = false
    let content = renderForAnnotation(this.outBuf)
    let truncated = false
    if (content.length > MAX_OUTPUT_CHARS) {
      content = content.slice(0, MAX_OUTPUT_CHARS)
      truncated = true
    }
    const text = content + (truncated ? '\n…[输出超长,已截断]' : '')
    this.onEvent({ kind: 'output', commandId: this.commandId, content: text })
  }
}
