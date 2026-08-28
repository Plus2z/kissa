/**
 * OSC 133 流式标注器与嵌套 Shell 边界识别状态机。
 *
 * 架构核心原则:
 * 1. 真实终端状态为事实来源,原始字节永不过滤、永不改写;
 * 2. 分类器/标注器作为旁路,负责选择增强视图并输出结构化事件;
 * 3. 两级路标机制 + 自动降级:
 *    - Level 1: OSC 133 Shell Integration (高精度: 命令边界 + 真实退出码 + cwd)
 *    - Level 2: 哨兵 Prompt 注入 (兼容性: 正则提取边界与退出码)
 *    - Level 3: 整段透传 (兜底模式: 持续流式气泡, 前端提示兼容模式)
 * 4. 全屏/TUI 检测 (备用屏 1049/1047/47) 独立并行生效, 不受边界识别模式降级影响。
 */

import { parseDiff, parseJson } from './structured.js'
import {
  parseNestedShellCommand,
  generateSentinelToken,
  buildSentinelInjection,
  createSentinelMatcher,
  type NestedShellInfo,
} from './nestedShell.js'

export type BoundaryMode = 'osc133' | 'sentinel' | 'passthrough'

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
  | { kind: 'boundary_mode'; mode: BoundaryMode; depth: number; targetName?: string }
  | { kind: 'inject_stdin'; data: string }

const MAX_OUTPUT_CHARS = 200_000
const INPUT_SILENCE_MS = 600
const OSC133_RE = /\x1b\]133;(A|B|C|D)(?:;([^\x07\x1b]*))?(?:\x07|\x1b\\)/g

/**
 * 远程交互式 Shell 提示符特征识别:
 * 覆盖 user@host:~$ / root@host:~# / [user@host dir]$ / hostname% / bash-5.2$ / (env) user@host:$ 等
 */
export function isRemotePrompt(text: string): boolean {
  const clean = stripAnsi(text).trimEnd()
  if (clean.length === 0) return false
  const lastLine = clean.slice(clean.lastIndexOf('\n') + 1).trim()
  // 排除密码提示、确认提示等交互输入行
  if (/password|passphrase|密码|\(y\/n\)|\[y\/n\]/i.test(lastLine)) {
    return false
  }
  return /(?:\[?[\w.\-()]+@[\w.\-]+[^\n]*?\]?[#$%>❯]|\(?[a-zA-Z0-9_.\-()]+\)?[#$%>❯]|bash[-0-9.]*[#$%>❯])(?:\s*)$/.test(lastLine)
}

/** 已知 TUI / 全屏程序名单 */
const TUI_PROGRAMS = new Set([
  'vim', 'nvim', 'vi', 'nano', 'emacs', 'less', 'more', 'most', 'man',
  'top', 'htop', 'btop', 'glances', 'k9s', 'lazygit', 'lazydocker',
  'tmux', 'screen',
  'claude', 'claude-code', 'codex', 'gemini', 'aider', 'chatgpt', 'qwen', 'iflow',
  'agy', 'antigravity',
  'opencode', 'goose', 'amp', 'q', 'kiro',
  'cursor-agent', 'copilot', 'kimi', 'openclaw', 'crush', 'openhands', 'droid',
])

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

/** 清理终端控制序列，但保留 ANSI SGR 颜色和样式序列 (\x1b[...m) */
export function cleanAnsiForOutput(s: string): string {
  return s
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g, '')
    .replace(/\x1b[PX^_][\s\S]*?\x1b\\/g, '')
    .replace(/\x1b[()][AB012]/g, '')
    .replace(/\x1b\[[0-9;?]*[a-ln-zA-Z~]/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1a\x1c-\x1f\x7f]/g, '')
}

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

function renderForAnnotation(raw: string): string {
  return cleanAnsiForOutput(collapseCr(raw))
}

function classifyPrompt(line: string): { mode: 'password' | 'confirm' | 'text' } | null {
  const l = line.trimEnd()
  if (l.length === 0) return null
  if (/password|passphrase|密码/i.test(l)) return { mode: 'password' }
  if (/\(y\/n\)|\[y\/n\]|\[Y\/N\]|\(yes\/no\)|\[yes\/no\]|\(Y\/N\)/i.test(l)) return { mode: 'confirm' }
  if (/[:?::?]$/.test(l)) return { mode: 'text' }
  return null
}

/** 嵌套 Shell 上下文栈节点 */
interface NestedFrame {
  info: NestedShellInfo
  parentCommandId: string
  mode: BoundaryMode | 'probing'
  token: string
  probeTimer: ReturnType<typeof setTimeout> | null
  sentinelTimer: ReturnType<typeof setTimeout> | null
  sentinelMatcher: RegExp
  activeCmdId: string | null
  activeCmdStartedAt: number
  outBuf: string
  lineBuf: string
  stage: 'pre' | 'idle' | 'out'
  mismatchCount: number
}

export class Osc133Annotator {
  private phase: Phase = 'prompt'
  private lastCwd: string | null = null
  private echoBuf = ''
  private outBuf = ''
  private outDirty = false
  private commandId: string | null = null
  private startedAt = 0
  private seq = 0
  private lastFlush = 0

  // 全屏状态
  private altScreen = false
  private tuiListed = false
  private fsEmitted = false
  private fsGraceTimer: ReturnType<typeof setTimeout> | null = null

  // 等待输入检测
  private lastDataAt = 0
  private awaiting = false
  private timer: ReturnType<typeof setInterval> | null = null

  // 当前命令文本
  private lastCommandText = ''

  // 嵌套 Shell 上下文栈
  private nestedStack: NestedFrame[] = []
  private buf = ''
  private altScanPos = 0

  constructor(
    private onEvent: (ev: AnnotatorEvent) => void,
    private fallbackText?: () => string | null,
  ) {
    this.timer = setInterval(() => this.tick(), 100)
    this.timer.unref?.()
  }

  get currentBoundaryMode(): BoundaryMode {
    if (this.nestedStack.length === 0) return 'osc133'
    const top = this.nestedStack[this.nestedStack.length - 1]!
    return top.mode === 'probing' ? 'osc133' : top.mode
  }

  get nestedDepth(): number {
    return this.nestedStack.length
  }

  write(chunk: string): void {
    this.buf += chunk
    this.process()
  }

  close(exitCode: number | null): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (this.fsGraceTimer) {
      clearTimeout(this.fsGraceTimer)
      this.fsGraceTimer = null
    }
    // 清理所有嵌套帧的定时器
    for (const frame of this.nestedStack) {
      if (frame.probeTimer) clearTimeout(frame.probeTimer)
      if (frame.sentinelTimer) clearTimeout(frame.sentinelTimer)
      if (frame.activeCmdId) {
        this.onEvent({
          kind: 'command_end',
          commandId: frame.activeCmdId,
          exitCode: null,
          durationMs: Date.now() - frame.activeCmdStartedAt,
        })
      }
    }
    this.nestedStack = []

    if (this.awaiting && this.commandId !== null) {
      this.onEvent({ kind: 'input_request_end', commandId: this.commandId })
      this.awaiting = false
    }
    if (this.tuiListed || this.altScreen) {
      this.tuiListed = false
      this.altScreen = false
      this.emitFullscreenEdge(true)
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

    // 仅当末尾包含未闭合（被 chunk 截断）的转义序列时，保留未完成的尾部到下轮。
    // 在 tail（OSC133 已消费之后的部分）内操作，阈值 128 字节覆盖带长路径的 OSC 序列。
    let keep = this.buf.length
    const tail = this.buf.slice(handled)
    const lastEscInTail = tail.lastIndexOf('\x1b')
    if (lastEscInTail >= 0 && lastEscInTail >= tail.length - 128) {
      const rest = tail.slice(lastEscInTail)
      const isCompleteCsi = /^\x1b\[[0-9;?]*[a-zA-Z~]/.test(rest)
      const isCompleteOsc = /^\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/.test(rest)
      if (!isCompleteCsi && !isCompleteOsc) {
        keep = handled + lastEscInTail
      }
    }

    // 全屏/备用屏序列扫描(独立并行生效,不受降级影响)。
    // 仅扫描本轮实际确定输出的范围（handled→keep），避免 carry 保留区下一轮被重复扫描。
    const scanFrom = Math.max(handled, this.altScanPos - 8)
    this.scanAltScreen(this.buf.slice(scanFrom, keep))
    this.altScanPos = keep

    const outputTail = this.buf.slice(handled, keep)
    this.routeText(outputTail)
    this.buf = this.buf.slice(keep)
    this.altScanPos = Math.max(0, this.altScanPos - keep)

    if (this.buf.length > 4096) {
      this.scanAltScreen(this.buf)
      this.routeText(this.buf)
      this.buf = ''
      this.altScanPos = 0
    }
    this.flushOutput(false)
  }


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
        this.flushOutput(true)
      }
    }
  }

  private emitFullscreenEdge(force = false): void {
    const active = this.altScreen || this.tuiListed
    if (active === this.fsEmitted) {
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
    // 嵌套环境中收到任何 OSC 133 序列 -> 第一级生效
    if (this.nestedStack.length > 0) {
      const top = this.nestedStack[this.nestedStack.length - 1]!
      if (top.mode === 'probing' || top.mode === 'sentinel' || top.mode === 'passthrough') {
        this.promoteToOsc133(top)
      }
    }

    switch (marker) {
      case 'A': {
        this.echoBuf = ''
        this.phase = 'prompt'
        if (param && param.length > 0) {
          this.lastCwd = param
          this.onEvent({ kind: 'cwd', cwd: param })
        }
        // 处于提示符准备输入命令时, 收敛退出任何非活动的备用屏状态
        if (this.altScreen) {
          this.altScreen = false
          this.emitFullscreenEdge(true)
        }
        break
      }
      case 'B':
        this.phase = 'echo'
        this.echoBuf = ''
        break
      case 'C': {
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
          this.tuiListed = TUI_PROGRAMS.has(invokedProgram(text))
          this.emitFullscreenEdge()

          // 嵌套 Shell 触发规则检测 (ssh, sudo -i, docker exec -it 等)
          const nestedInfo = parseNestedShellCommand(text)
          if (nestedInfo) {
            this.pushNestedFrame(nestedInfo, this.commandId)
          }
        } else {
          this.commandId = null
        }
        break
      }
      case 'D': {
        this.endAwaiting()
        // 若当前处于嵌套环境且该命令正是启动嵌套 shell 的命令结束 (如 exit 退出 ssh)
        if (this.nestedStack.length > 0) {
          const top = this.nestedStack[this.nestedStack.length - 1]!
          if (top.parentCommandId === this.commandId) {
            this.popNestedFrame()
          }
        }
        this.flushOutput(true)
        this.altScreen = false
        this.tuiListed = false
        this.emitFullscreenEdge(true)
        if (this.commandId !== null) {
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

    // 只要有任何数据流到达，立即结束前序的 awaiting 状态，通知前端关闭输入框
    this.endAwaiting()

    if (this.phase === 'echo') {
      this.echoBuf += text
    } else if (this.phase === 'output') {
      if (this.nestedStack.length > 0) {
        const top = this.nestedStack[this.nestedStack.length - 1]!
        if (top.mode === 'sentinel') {
          this.handleSentinelOutput(top, text)
          return
        }
        if (top.mode === 'passthrough') {
          this.outBuf += text
          this.outDirty = true
          this.lastDataAt = Date.now()
          return
        }
        if (top.mode === 'probing') {
          this.handleProbingOutput(top, text)
          return
        }
      }
      this.outBuf += text
      this.outDirty = true
      this.lastDataAt = Date.now()
    }
  }

  /* ---- 嵌套 Shell 状态机与三级降级管理 ---- */

  private pushNestedFrame(info: NestedShellInfo, parentCommandId: string): void {
    const token = generateSentinelToken()
    const frame: NestedFrame = {
      info,
      parentCommandId,
      mode: 'probing',
      token,
      probeTimer: null,
      sentinelTimer: null,
      sentinelMatcher: createSentinelMatcher(token),
      activeCmdId: null,
      activeCmdStartedAt: 0,
      outBuf: '',
      lineBuf: '',
      stage: 'pre',
      mismatchCount: 0,
    }

    // 注意：不使用盲等定时器！仅在检测到远程 Shell 提示符或 OSC 133 到达时才尝试哨兵注入
    this.nestedStack.push(frame)
    this.onEvent({
      kind: 'boundary_mode',
      mode: 'osc133',
      depth: this.nestedStack.length,
      targetName: info.targetName,
    })
  }

  private popNestedFrame(): void {
    const frame = this.nestedStack.pop()
    if (!frame) return
    if (frame.probeTimer) clearTimeout(frame.probeTimer)
    if (frame.sentinelTimer) clearTimeout(frame.sentinelTimer)
    if (frame.activeCmdId) {
      this.endNestedCommand(frame, null)
    }
    const current = this.nestedStack[this.nestedStack.length - 1]
    this.onEvent({
      kind: 'boundary_mode',
      mode: current ? (current.mode === 'probing' ? 'osc133' : current.mode) : 'osc133',
      depth: this.nestedStack.length,
      targetName: current?.info.targetName,
    })
  }

  private promoteToOsc133(frame: NestedFrame): void {
    if (frame.probeTimer) {
      clearTimeout(frame.probeTimer)
      frame.probeTimer = null
    }
    if (frame.sentinelTimer) {
      clearTimeout(frame.sentinelTimer)
      frame.sentinelTimer = null
    }
    frame.mode = 'osc133'
    this.onEvent({
      kind: 'boundary_mode',
      mode: 'osc133',
      depth: this.nestedStack.length,
      targetName: frame.info.targetName,
    })
  }

  private handleProbingOutput(frame: NestedFrame, text: string): void {
    frame.lineBuf += text
    this.outBuf += text
    this.outDirty = true
    this.lastDataAt = Date.now()

    // 检查是否已经落入远程 Shell 提示符 (且不能是密码输入提示)
    if (isRemotePrompt(frame.lineBuf)) {
      // 成功落入远程 Shell 提示符 -> 立即清除输入状态，并尝试第二级哨兵注入
      this.endAwaiting()
      frame.stage = 'idle'
      // 强制收敛任何残留全屏态
      if (this.altScreen) {
        this.altScreen = false
        this.emitFullscreenEdge(true)
      }
      this.trySentinelInjection(frame)
    }
  }

  private trySentinelInjection(frame: NestedFrame): void {
    if (frame.probeTimer) {
      clearTimeout(frame.probeTimer)
      frame.probeTimer = null
    }
    frame.mode = 'sentinel'
    this.onEvent({
      kind: 'boundary_mode',
      mode: 'sentinel',
      depth: this.nestedStack.length,
      targetName: frame.info.targetName,
    })

    // 下发哨兵注入指令到 PTY (兼容 bash / zsh / sh / busybox)
    const injectionCmd = buildSentinelInjection(frame.token)
    this.onEvent({ kind: 'inject_stdin', data: ` ${injectionCmd}\n` })

    // 第二级确认窗口 (6秒内未匹配到任何哨兵, 降级至第三级透传)
    if (frame.sentinelTimer) clearTimeout(frame.sentinelTimer)
    frame.sentinelTimer = setTimeout(() => {
      frame.sentinelTimer = null
      if (frame.mode === 'sentinel' && frame.stage === 'pre') {
        this.fallbackToPassthrough(frame)
      }
    }, 6000)
    frame.sentinelTimer.unref?.()
  }

  private fallbackToPassthrough(frame: NestedFrame): void {
    if (frame.sentinelTimer) {
      clearTimeout(frame.sentinelTimer)
      frame.sentinelTimer = null
    }
    frame.mode = 'passthrough'
    this.onEvent({
      kind: 'boundary_mode',
      mode: 'passthrough',
      depth: this.nestedStack.length,
      targetName: frame.info.targetName,
    })
  }

  /* ---- 哨兵 Prompt 模式输出解析 ---- */

  private handleSentinelOutput(frame: NestedFrame, text: string): void {
    frame.lineBuf += text
    const token = frame.token
    const markerPrefix = `@@CTI_${token}_`

    while (frame.lineBuf.length > 0) {
      if (frame.stage === 'pre') {
        const match = frame.sentinelMatcher.exec(frame.lineBuf)
        if (match) {
          frame.stage = 'idle'
          if (frame.sentinelTimer) {
            clearTimeout(frame.sentinelTimer)
            frame.sentinelTimer = null
          }
          // 进入 idle 时强制收敛全屏状态与输入状态
          this.endAwaiting()
          if (this.altScreen) {
            this.altScreen = false
            this.emitFullscreenEdge(true)
          }
          frame.lineBuf = frame.lineBuf.slice(match.index + match[0].length)
          continue
        }
        // 若在 pre 阶段收到常见提示符, 切换为 idle
        if (isRemotePrompt(frame.lineBuf)) {
          frame.stage = 'idle'
          this.endAwaiting()
          if (this.altScreen) {
            this.altScreen = false
            this.emitFullscreenEdge(true)
          }
        }
        break
      }

      if (frame.stage === 'idle') {
        // 在 idle 阶段收敛全屏态与输入态
        this.endAwaiting()
        if (this.altScreen) {
          this.altScreen = false
          this.emitFullscreenEdge(true)
        }

        const nl = frame.lineBuf.indexOf('\n')
        if (nl < 0) break // 尚未收到完整命令行回显
        const line = stripAnsi(frame.lineBuf.slice(0, nl)).replace(/\r$/, '').trim()
        frame.lineBuf = frame.lineBuf.slice(nl + 1)
        if (line.length === 0) continue
        if (line.includes(markerPrefix)) continue
        if (isRemotePrompt(line)) continue // 过滤掉提示符行

        this.startNestedCommand(frame, line)
        frame.stage = 'out'
        continue
      }

      if (frame.stage === 'out') {
        const match = frame.sentinelMatcher.exec(frame.lineBuf)
        if (match) {
          const before = frame.lineBuf.slice(0, match.index)
          const exitCodeStr = match[1]
          const ec = exitCodeStr !== undefined && /^-?\d+$/.test(exitCodeStr) ? Number(exitCodeStr) : null
          frame.lineBuf = frame.lineBuf.slice(match.index + match[0].length)

          frame.outBuf += (frame.outBuf.length > 0 && before.length > 0 ? '\n' : '') + before
          this.endNestedCommand(frame, ec)
          frame.stage = 'idle'
          this.endAwaiting()
          // 命令结束回到 idle 时强制退出全屏
          if (this.altScreen) {
            this.altScreen = false
            this.emitFullscreenEdge(true)
          }
          continue
        } else {
          const lastNl = frame.lineBuf.lastIndexOf('\n')
          if (lastNl >= 0) {
            const lines = frame.lineBuf.slice(0, lastNl)
            frame.lineBuf = frame.lineBuf.slice(lastNl + 1)
            frame.outBuf += (frame.outBuf.length > 0 && lines.length > 0 ? '\n' : '') + lines
            if (frame.activeCmdId !== null && frame.outBuf.length > 0) {
              const content = renderForAnnotation(frame.outBuf)
              this.onEvent({ kind: 'output', commandId: frame.activeCmdId, content })
            }
          }
          break
        }
      }
    }
  }

  private startNestedCommand(frame: NestedFrame, text: string): void {
    frame.activeCmdId = `nest-${++this.seq}`
    frame.activeCmdStartedAt = Date.now()
    frame.outBuf = ''
    this.onEvent({
      kind: 'command_start',
      commandId: frame.activeCmdId,
      text,
      cwd: null,
      startedAt: frame.activeCmdStartedAt,
    })
  }

  private endNestedCommand(frame: NestedFrame, exitCode: number | null): void {
    if (!frame.activeCmdId) return
    const content = renderForAnnotation(frame.outBuf)
    if (content.length > 0) {
      this.onEvent({ kind: 'output', commandId: frame.activeCmdId, content })
    }
    this.onEvent({
      kind: 'command_end',
      commandId: frame.activeCmdId,
      exitCode,
      durationMs: Date.now() - frame.activeCmdStartedAt,
    })
    frame.activeCmdId = null
    frame.outBuf = ''
  }

  private endAwaiting(): void {
    if (this.awaiting && this.commandId !== null) {
      this.awaiting = false
      this.onEvent({ kind: 'input_request_end', commandId: this.commandId })
    }
  }

  private tick(): void {
    if (this.phase !== 'output' || this.commandId === null || this.awaiting || this.outBuf.length === 0) {
      return
    }
    // 若当前正处于嵌套 Shell 的准备输入阶段 (idle), 绝不误报密码等待
    if (this.nestedStack.length > 0) {
      const top = this.nestedStack[this.nestedStack.length - 1]!
      if (top.stage === 'idle') {
        return
      }
      if (top.mode === 'sentinel' && top.stage !== 'out') {
        return
      }
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

  private detectStructured(): void {
    if (this.commandId === null || this.outBuf.length === 0) return
    const rendered = renderForAnnotation(this.outBuf)
    const plain = stripAnsi(rendered)
    try {
      if (plain.startsWith('diff --git ') || /^git\s+(diff|show|log\s+-p)\b/.test(this.lastCommandText)) {
        const d = parseDiff(plain)
        if (d) {
          this.onEvent({ kind: 'structured', commandId: this.commandId, view: 'diff', data: d })
          return
        }
      }
      const j = parseJson(plain)
      if (j !== null) {
        this.onEvent({ kind: 'structured', commandId: this.commandId, view: 'json', data: j })
      }
    } catch {
      /* 解析异常:保持纯文本 */
    }
  }

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
