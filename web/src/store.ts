/**
 * 聊天消息状态(增强视图层)。
 *
 * 注意边界:这里的消息全部来自服务端旁路标注(command_start/output/command_end)。
 * 标注缺失或损坏时,视图层应引导用户切换到终端视图(真相层)兜底,
 * 而不是假设数据总是完整。
 */

import { create } from 'zustand'
import type { ServerMessage, SshTarget } from './protocol'
import type { ConnStatus } from './ws'

/** 超过此行数的输出气泡默认折叠 */
const COLLAPSE_THRESHOLD = 30

export type OutputStatus = 'running' | 'done' | 'failed' | 'ended'

export interface ChatMessage {
  id: string
  kind: 'command' | 'output' | 'system'
  ts: number
  // command
  text?: string
  cwd?: string | null
  // output
  commandId?: string
  content?: string
  status?: OutputStatus
  exitCode?: number | null
  durationMs?: number
  collapsed?: boolean
  /** 结构化增强视图(diff/json);原文仍在 content,可随时切回 */
  structured?: { kind: 'diff' | 'json'; data: unknown }
}

/** 当前活跃的交互输入请求(气泡内嵌输入组件的数据) */
export interface InputRequest {
  commandId: string
  kind: 'password' | 'confirm' | 'text'
  prompt: string
}

interface AppState {
  connStatus: ConnStatus
  cwd: string
  /** 服务端上报的主机名(本机设备名,终端名的默认来源) */
  hostname: string
  /** 用户自定义会话名(终端名);空 = 回退设备名/SSH 目标 */
  sessionName: string
  /** 当前 SSH 连接目标(终端名 = 目标设备) */
  sshTarget: SshTarget | null
  /** 当前边界识别模式 */
  boundaryMode: 'osc133' | 'sentinel' | 'passthrough'
  boundaryDepth: number
  nestedTargetName: string | null
  messages: ChatMessage[]
  /** 全屏程序状态(备用屏缓冲区) */
  fullscreen: { active: boolean; commandId: string | null }
  /** 活跃的输入请求 */
  inputRequest: InputRequest | null
  handleServer: (msg: ServerMessage) => void
  setConnStatus: (s: ConnStatus) => void
  /** 本地即时更新当前会话名(重命名后无服务端回执) */
  setSessionName: (name: string) => void
  reset: () => void
  toggleCollapse: (id: string) => void
}

export const useStore = create<AppState>()((set) => ({
  connStatus: 'connecting',
  cwd: '~',
  hostname: '',
  sessionName: '',
  sshTarget: null,
  boundaryMode: 'osc133',
  boundaryDepth: 0,
  nestedTargetName: null,
  messages: [],
  fullscreen: { active: false, commandId: null },
  inputRequest: null,

  handleServer: (msg) => {
    switch (msg.type) {
      case 'ready':
        set((s) => ({
          hostname: msg.hostname,
          messages: [
            ...s.messages,
            { id: `sys-${Date.now()}`, kind: 'system', ts: Date.now(), text: `会话就绪(${msg.shell})` },
          ],
        }))
        break
      case 'cwd':
        set({ cwd: msg.cwd })
        break
      case 'ssh_target': {
        // SSH 会话在对话流里的呈现:连接/断开系统气泡(适配对话界面)
        const text = msg.target
          ? `🔌 已连接 ${msg.target.user ? msg.target.user + '@' : ''}${msg.target.host}(SSH)`
          : '🔌 SSH 连接已断开'
        set((s) => ({
          sshTarget: msg.target,
          messages: [
            ...s.messages,
            { id: `ssh-${Date.now()}-${s.messages.length}`, kind: 'system', ts: Date.now(), text },
          ],
        }))
        break
      }
      case 'boundary_mode': {
        const modeLabel =
          msg.mode === 'osc133'
            ? '🎯 高精度 Shell 集成 (OSC 133)'
            : msg.mode === 'sentinel'
            ? '⚡ 哨兵兼容模式'
            : '🛡️ 兼容透传模式 (整段流式展示)'
        set((s) => ({
          boundaryMode: msg.mode,
          boundaryDepth: msg.depth,
          nestedTargetName: msg.targetName ?? null,
          messages:
            msg.depth > 0
              ? [
                  ...s.messages,
                  {
                    id: `bmode-${Date.now()}-${s.messages.length}`,
                    kind: 'system',
                    ts: Date.now(),
                    text: `[${msg.targetName || '嵌套环境'}] 边界模式: ${modeLabel}`,
                  },
                ]
              : s.messages,
        }))
        break
      }
      case 'command_start':
        set((s) => ({
          messages: [
            ...s.messages,
            { id: `cmd-${msg.commandId}`, kind: 'command', ts: msg.startedAt, text: msg.text, cwd: msg.cwd },
            {
              id: `out-${msg.commandId}`,
              kind: 'output',
              ts: msg.startedAt,
              commandId: msg.commandId,
              content: '',
              status: 'running',
            },
          ],
        }))
        break
      case 'output': {
        const lines = msg.content.split('\n').length
        set((s) => ({
          messages: s.messages.map((m) => {
            if (m.commandId !== msg.commandId || m.kind !== 'output') return m
            const next = { ...m, content: msg.content }
            // 自动折叠只在跨过阈值时置一次 true;用户手动展开/折叠优先于后续增长
            if (m.collapsed === undefined && lines > COLLAPSE_THRESHOLD) {
              next.collapsed = true
            }
            return next
          }),
        }))
        break
      }
      case 'command_end': {
        const status: OutputStatus =
          msg.exitCode === null ? 'ended' : msg.exitCode === 0 ? 'done' : 'failed'
        set((s) => ({
          messages: s.messages.map((m) =>
            m.commandId === msg.commandId && m.kind === 'output'
              ? { ...m, status, exitCode: msg.exitCode, durationMs: msg.durationMs }
              : m,
          ),
          inputRequest:
            s.inputRequest?.commandId === msg.commandId ? null : s.inputRequest,
        }))
        break
      }
      case 'fullscreen':
        set((s) => ({
          fullscreen: { active: msg.status === 'active', commandId: msg.commandId },
          messages: [
            ...s.messages,
            {
              id: `fs-${Date.now()}-${s.messages.length}`,
              kind: 'system',
              ts: Date.now(),
              text:
                msg.status === 'active'
                  ? '🖥 已进入全屏程序,已切换到终端视图'
                  : '🖥 全屏程序已退出,返回对话',
            },
          ],
        }))
        break
      case 'input_request':
        set({
          inputRequest: { commandId: msg.commandId, kind: msg.kind, prompt: msg.prompt },
        })
        break
      case 'input_request_end':
        set((s) => ({
          inputRequest:
            s.inputRequest?.commandId === msg.commandId ? null : s.inputRequest,
        }))
        break
      case 'output_structured':
        set((s) => ({
          messages: s.messages.map((m) =>
            m.commandId === msg.commandId && m.kind === 'output'
              ? { ...m, structured: { kind: msg.kind, data: msg.data } }
              : m,
          ),
        }))
        break
      case 'replay':
        /* replay 在 net.ts 展开后逐条路由,不会直接进到这里 */
        break
      case 'system':
      case 'error':
        set((s) => ({
          messages: [...s.messages, { id: `sys-${Date.now()}-${s.messages.length}`, kind: 'system', ts: Date.now(), text: msg.text }],
        }))
        break
      case 'raw':
        /* raw 由真相层直接消费,不进聊天状态 */
        break
    }
  },

  setConnStatus: (connStatus) => set({ connStatus }),

  setSessionName: (sessionName) => set({ sessionName }),

  reset: () =>
    set({
      messages: [],
      cwd: '~',
      hostname: '',
      sessionName: '',
      sshTarget: null,
      boundaryMode: 'osc133',
      boundaryDepth: 0,
      nestedTargetName: null,
      fullscreen: { active: false, commandId: null },
      inputRequest: null,
    }),

  toggleCollapse: (id) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, collapsed: !m.collapsed } : m)),
    })),
}))

/** 是否有本地命令在跑:最后一个"非远程" output 气泡处于 running。
 *  远程命令气泡(SSH 内,commandId 以 r- 开头)的结束不影响 SSH 会话的运行态 */
export function selectRunning(messages: ChatMessage[]): ChatMessage | undefined {
  const last = [...messages]
    .reverse()
    .find((m) => m.kind === 'output' && !m.commandId?.startsWith('r-'))
  return last?.status === 'running' ? last : undefined
}

/** 未读辅助:导出给组件使用 */
export { COLLAPSE_THRESHOLD }
