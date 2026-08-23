/**
 * WebSocket 消息协议(阶段三)。
 *
 * 架构原则:原始字节流是事实,标注事件是建议。
 * - `raw` 消息承载 PTY 输出的原始字节(base64),永远完整转发,不被标注层过滤或改写;
 *   前端终端真相层只消费它。
 * - 其余消息(`command_start` / `output` / `command_end` / `cwd` / ...)是服务端旁路生成的
 *   结构化标注,丢失或损坏只影响增强气泡,不影响终端交互。
 *
 * 会话与连接解耦(阶段三):会话由 sessionId 标识,断线后存活(默认 30 分钟),
 * 客户端重连时发送 attach 续接;每条服务端消息带自增 seq,重连方带 lastSeq
 * 增量补发;页面刷新(真相层为空)时附 wantRaw 请求原始字节重放。
 */

export type ClientMessage =
  | { type: 'command'; text: string; clientMsgId: string; confirmed?: boolean }
  | { type: 'stdin'; data: string }
  | { type: 'resize'; cols: number; rows: number }
  /** Tab 补全:对输入框 text 的 cursor 位置求候选(异步,用 token 关联响应) */
  | { type: 'complete'; token: number; text: string; cursor: number }
  /** 连接后第一件事:续接已有会话(sessionId 为空则新建) */
  | { type: 'attach'; sessionId: string | null; lastSeq: number; wantRaw: boolean }
  /** 会话重命名(终端名);sessionId 为目标会话(可为后台保活中的会话) */
  | { type: 'rename'; sessionId: string; name: string }

export type ServerMessage =
  | { type: 'ready'; sessionId: string; resumed: boolean; cols: number; rows: number; shell: string; hostname: string }
  | { type: 'raw'; data: string }
  | { type: 'command_start'; commandId: string; text: string; cwd: string | null; startedAt: number }
  | { type: 'output'; commandId: string; content: string }
  | { type: 'command_end'; commandId: string; exitCode: number | null; durationMs: number }
  /** 全屏程序:进入备用屏缓冲区(1049/1047/47)→ active,退出 → exited */
  | { type: 'fullscreen'; commandId: string | null; status: 'active' | 'exited' }
  /** 程序疑似等待输入(提示符无换行 + 输出静默);kind 决定前端输入组件形态 */
  | { type: 'input_request'; commandId: string; kind: 'password' | 'confirm' | 'text'; prompt: string }
  /** 等待结束(有新输出 / 命令结束),前端收起输入组件 */
  | { type: 'input_request_end'; commandId: string }
  /** 结构化输出(diff / JSON 已解析),气泡可渲染增强视图,原文仍在 output 里 */
  | { type: 'output_structured'; commandId: string; kind: 'diff' | 'json'; data: unknown }
  /** complete 的响应:候选词、词在 text 中的范围、命令位/参数位、目录集合 */
  | { type: 'completion'; token: number; items: string[]; dirs: string[]; start: number; end: number; mode: 'command' | 'file' }
  /** attach 的重放:原始字节(整段 base64)+ 断线期间错过的标注事件(带原 seq) */
  | { type: 'replay'; raw: string; events: Array<ServerMessage & { seq: number }> }
  | { type: 'cwd'; cwd: string }
  /** 会话检测到 SSH 连接(终端名 = 目标设备);target 为空表示 SSH 已退出 */
  | { type: 'ssh_target'; target: { user: string; host: string; port: number } | null }
  | { type: 'system'; text: string }
  | { type: 'error'; text: string }
