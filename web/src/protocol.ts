/**
 * 与 server/src/protocol.ts 保持一致的前端侧协议定义。
 */

export type ClientMessage =
  | { type: 'command'; text: string; clientMsgId: string; confirmed?: boolean }
  | { type: 'stdin'; data: string }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'complete'; token: number; text: string; cursor: number }
  | { type: 'attach'; sessionId: string | null; lastSeq: number; wantRaw: boolean }
  | { type: 'rename'; sessionId: string; name: string }

export interface SshTarget {
  user: string
  host: string
  port: number
}

export type ServerMessage =
  | { type: 'ready'; sessionId: string; resumed: boolean; cols: number; rows: number; shell: string; hostname: string }
  | { type: 'raw'; data: string }
  | { type: 'command_start'; commandId: string; text: string; cwd: string | null; startedAt: number }
  | { type: 'output'; commandId: string; content: string }
  | { type: 'command_end'; commandId: string; exitCode: number | null; durationMs: number }
  | { type: 'fullscreen'; commandId: string | null; status: 'active' | 'exited'; mode?: 'tui' | 'pager'; program?: string }
  | { type: 'input_request'; commandId: string; kind: 'password' | 'confirm' | 'text'; prompt: string }
  | { type: 'input_request_end'; commandId: string }
  | { type: 'output_structured'; commandId: string; kind: 'diff' | 'json'; data: unknown }
  | { type: 'completion'; token: number; items: string[]; dirs: string[]; start: number; end: number; mode: 'command' | 'file' }
  | { type: 'replay'; raw: string; events: Array<ServerMessage & { seq: number }> }
  | { type: 'cwd'; cwd: string }
  | { type: 'ssh_target'; target: SshTarget | null }
  | { type: 'boundary_mode'; mode: 'osc133' | 'sentinel' | 'passthrough'; depth: number; targetName?: string }
  | { type: 'system'; text: string }
  | { type: 'error'; text: string }

export interface DangerRule {
  id: string
  pattern: string
  message: string
}
