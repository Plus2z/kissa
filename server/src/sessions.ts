/**
 * PTY 会话(阶段三:与 WebSocket 连接解耦)。
 *
 * 会话由 sessionId 标识,WS 断开后继续存活(默认 30 分钟空闲回收)——
 * 长任务(npm install / AI CLI)在断线/刷新期间继续跑,重连续接。
 *
 * 每条下发给客户端的消息带自增 seq;标注事件存历史环形缓冲(重放用),
 * 原始字节存 rawRing(页面刷新后重建真相层用)。
 *
 * shell 集成:rcfile 注入 OSC 133 标记,bash 自己报告命令边界与退出码;
 * 数据流主干:PTY 原始字节 → (a) 原样转发真相层;(b) 旁路标注器 → 结构化事件。
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import type { ServerMessage } from './protocol.js'
import { Osc133Annotator } from './osc133.js'
import { PythonPty } from './pythonPty.js'
import { computeCompletions } from './completion.js'
import { sandboxCommand, sandboxModeFromEnv, type SandboxMode } from './sandbox.js'
import { parseSshTarget, buildSshCommand, type SshTarget } from './ssh.js'

const RCFILE_TEMPLATE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../shell/rcfile.bash'),
  'utf8',
)

/** 断线后保留会话的时长 */
const IDLE_TIMEOUT_MS = 30 * 60 * 1000
/** 标注事件历史上限(条);原始字节另有 RAW_LIMIT */
const HISTORY_LIMIT = 3000
/** 原始字节环形缓冲上限 */
const RAW_LIMIT = 4 * 1024 * 1024

type SeqMessage = ServerMessage & { seq: number }

export class Session {
  readonly id = randomUUID()
  readonly createdAt = Date.now()
  readonly sandboxMode: SandboxMode = sandboxModeFromEnv()
  private seq = 0
  private client: ((payload: string) => void) | null = null
  private history: SeqMessage[] = []
  private rawRing: string[] = []
  private rawBytes = 0
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private closed = false
  private lastActiveAt = Date.now()
  /** 会话当前目录(cwd 事件驱动),供补全的辅助进程使用 */
  private sessionCwd =
    this.sandboxMode === 'bwrap'
      ? resolve(process.env.LIMINAL_WORKSPACE ?? process.cwd())
      : (process.env.HOME ?? process.cwd())
  /** 会话显示名(终端名);空 = 前端回退(本机设备名 / SSH 目标) */
  private name = ''
  /** 当前 SSH 连接目标(检测到 ssh 命令时设置;退出 ssh 后清空) */
  private sshTarget: SshTarget | null = null
  /** 活跃 ssh 命令的 commandId(其 command_end 时清空 sshTarget) */
  private activeSshCommandId: string | null = null
  /** 会话启动后自动执行的 ssh 命令(新建 SSH 会话);bash 首个提示符出现时写入 */
  private pendingSshCommand: string | null = null

  constructor(
    private onDispose: (s: Session) => void,
    opts: { sshTarget?: SshTarget } = {},
  ) {
    if (opts.sshTarget) {
      this.sshTarget = opts.sshTarget
      this.pendingSshCommand = buildSshCommand(opts.sshTarget)
    }
    this.spawnPty()
  }

  summary(): {
    id: string
    createdAt: number
    lastActiveAt: number
    cwd: string
    connected: boolean
    sandboxMode: SandboxMode
    name: string
    sshTarget: SshTarget | null
  } {
    return {
      id: this.id,
      createdAt: this.createdAt,
      lastActiveAt: this.lastActiveAt,
      cwd: this.sessionCwd,
      connected: this.client !== null,
      sandboxMode: this.sandboxMode,
      name: this.name,
      sshTarget: this.sshTarget,
    }
  }

  /** 会话重命名(终端名);空名按清除处理 */
  rename(name: string): void {
    this.name = name.trim()
    this.lastActiveAt = Date.now()
  }

  /* ---- 客户端连接管理 ---- */

  /** 客户端上线:后续消息实时下发;返回应补发的事件与原始字节 */
  attach(send: (payload: string) => void, lastSeq: number, wantRaw: boolean): SeqMessage[] {
    this.lastActiveAt = Date.now()
    this.client = send
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
    return wantRaw || lastSeq > 0 ? this.history.filter((m) => m.seq > lastSeq) : []
  }

  rawBacklog(): string {
    return this.rawRing.join('')
  }

  /** 客户端断线:会话保活,进入空闲计时 */
  detach(): void {
    this.lastActiveAt = Date.now()
    this.client = null
    if (this.closed || this.idleTimer) return
    this.idleTimer = setTimeout(() => this.dispose(), IDLE_TIMEOUT_MS)
    this.idleTimer.unref?.()
  }

  dispose(): void {
    if (this.closed) return
    this.closed = true
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
    this.pty.kill()
    rmSync(this.dir, { recursive: true, force: true })
    this.onDispose(this)
  }

  /* ---- 发送(带 seq;raw 走环形缓冲不进历史) ---- */

  private send(msg: ServerMessage): void {
    const withSeq: SeqMessage = { ...(msg as { seq?: number }), seq: ++this.seq } as SeqMessage
    if (msg.type !== 'raw') {
      this.history.push(withSeq)
      if (this.history.length > HISTORY_LIMIT) this.history.splice(0, this.history.length - HISTORY_LIMIT)
    }
    if (this.client) {
      try {
        this.client(JSON.stringify(withSeq))
      } catch {
        /* 连接已关闭 */
      }
    }
  }

  /* ---- PTY 与数据流 ---- */

  private dir = ''
  private pty!: PythonPty

  private spawnPty(): void {
    const cols = 80
    const rows = 24
    const shell = process.env.SHELL && process.env.SHELL.endsWith('bash') ? process.env.SHELL : '/bin/bash'

    this.dir = mkdtempSync(join(tmpdir(), 'liminal-'))
    const rcPath = join(this.dir, 'rcfile.bash')
    writeFileSync(rcPath, RCFILE_TEMPLATE)

    const annotator = new Osc133Annotator(
      (ev) => {
        switch (ev.kind) {
          case 'cwd':
            this.sessionCwd = ev.cwd
            this.send({ type: 'cwd', cwd: ev.cwd })
            break
          case 'command_start':
            this.send({
              type: 'command_start',
              commandId: ev.commandId,
              text: ev.text,
              cwd: ev.cwd,
              startedAt: ev.startedAt,
            })
            // SSH 检测:终端名切换为目标设备;对应命令结束时恢复本机
            {
              const target = parseSshTarget(ev.text)
              if (target) {
                this.sshTarget = target
                this.activeSshCommandId = ev.commandId
                this.send({ type: 'ssh_target', target })
              }
            }
            break
          case 'output':
            this.send({ type: 'output', commandId: ev.commandId, content: ev.content })
            break
          case 'command_end':
            this.send({
              type: 'command_end',
              commandId: ev.commandId,
              exitCode: ev.exitCode,
              durationMs: ev.durationMs,
            })
            // ssh 命令结束:SSH 目标清除,终端名回到本机设备名
            if (ev.commandId === this.activeSshCommandId) {
              this.activeSshCommandId = null
              this.sshTarget = null
              this.send({ type: 'ssh_target', target: null })
            }
            break
          case 'fullscreen':
            this.send({ type: 'fullscreen', commandId: ev.commandId, status: ev.status })
            break
          case 'input_request':
            this.send({
              type: 'input_request',
              commandId: ev.commandId,
              kind: ev.mode,
              prompt: ev.prompt,
            })
            break
          case 'input_request_end':
            this.send({ type: 'input_request_end', commandId: ev.commandId })
            break
          case 'structured':
            this.send({
              type: 'output_structured',
              commandId: ev.commandId,
              kind: ev.view,
              data: ev.data,
            })
            break
        }
      },
      () => {
        const t = this.pendingCommandText
        this.pendingCommandText = null
        return t
      },
    )

    const launch = sandboxCommand(this.sandboxMode, shell, ['--rcfile', rcPath, '-i'], this.sessionCwd, this.dir)
    this.pty = new PythonPty(launch.file, launch.args, {
      cols,
      rows,
      cwd: this.sessionCwd,
      env: { TERM: 'xterm-256color' },
    }, {
      onData: (data) => {
        this.rawRing.push(data)
        this.rawBytes += data.length
        while (this.rawBytes > RAW_LIMIT && this.rawRing.length > 1) {
          this.rawBytes -= this.rawRing.shift()!.length
        }
        // 新建 SSH 会话:bash 首个提示符出现后写入 ssh 命令(过早写入会丢)
        if (this.pendingSshCommand) {
          const cmd = this.pendingSshCommand
          this.pendingSshCommand = null
          this.pty.write(cmd + '\r')
        }
        this.send({ type: 'raw', data: Buffer.from(data, 'utf8').toString('base64') })
        try {
          annotator.write(data)
        } catch {
          this.send({ type: 'system', text: '标注器异常,气泡增强降级' })
        }
      },
      onExit: (exitCode) => {
        try {
          annotator.close(exitCode)
        } catch {
          /* 降级即可 */
        }
        // 会话结束即销毁(bash exit 后没有续接意义)
        this.client?.(JSON.stringify({ type: 'system', text: `会话已结束(exit ${exitCode ?? 'signal'})`, seq: ++this.seq }))
        this.dispose()
      },
    })
  }

  /** 聊天路径发送的最近一条命令文本,作为回显为空时的兜底 */
  private pendingCommandText: string | null = null

  sendSystem(text: string): void {
    this.send({ type: 'system', text })
  }

  writeCommand(text: string): void {
    this.lastActiveAt = Date.now()
    this.pendingCommandText = text
    this.pty.write(text.trimEnd() + '\r')
  }

  writeStdin(data: string): void {
    this.lastActiveAt = Date.now()
    this.pty.write(data)
  }

  resize(cols: number, rows: number): void {
    this.pty.resize(cols, rows)
  }

  complete(token: number, text: string, cursor: number): void {
    void computeCompletions(text, cursor, this.sessionCwd).then((r) => {
      this.send({
        type: 'completion',
        token,
        items: r.items,
        dirs: [...r.dirs],
        start: r.start,
        end: r.end,
        mode: r.mode,
      })
    })
  }
}
