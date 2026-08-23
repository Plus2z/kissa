/**
 * 网络单例:WsClient ↔ store ↔ 真相层 的接线 + 会话续接(attach)。
 *
 * - raw 消息直走真相层,其余进增强层(聊天状态)
 * - 每条带 seq 的消息推进 lastSeq;连接建立即发 attach(带上次会话 id),
 *   会话仍在则服务端补发 replay(原始字节 + 错过的标注),实现断线/刷新不丢状态
 * - 危险命令规则从服务端拉取,前后端共用同一份
 */

import { WsClient } from './ws'
import { useStore } from './store'
import { truthLayer } from './truth/layer'
import { hydrateSettingsFromServer } from './settings'
import type { ServerMessage, DangerRule } from './protocol'
import { apiFetch } from './auth'

const SESSION_KEY = 'kissa.session'
const OLD_SESSION_KEY = 'liminal.session'

/** 已收到的最大 seq(attach 时上报,服务端据此增量补发) */
let lastSeq = 0
/** 本页是否已从 replay 恢复过真相层(决定重连时要不要原始字节) */
let resumedOnce = false

function saveSessionId(id: string): void {
  try {
    localStorage.setItem(SESSION_KEY, id)
  } catch {
    /* 忽略 */
  }
}
function loadSessionId(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY) || localStorage.getItem(OLD_SESSION_KEY)
  } catch {
    return null
  }
}
function clearSessionId(): void {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    /* 忽略 */
  }
}

/* ---- 危险命令规则(前端预检;服务端仍是权威拦截层) ---- */

let dangerCompiled: Array<{ rule: DangerRule; re: RegExp }> = []

export function matchDangerClient(text: string): DangerRule | null {
  for (const { rule, re } of dangerCompiled) {
    if (re.test(text)) return rule
  }
  return null
}

async function loadDangerRules(): Promise<void> {
  try {
    const res = await apiFetch('/api/danger-rules')
    if (!res.ok) return
    const rules = (await res.json()) as DangerRule[]
    dangerCompiled = rules.map((r) => ({ rule: r, re: new RegExp(r.pattern) }))
  } catch {
    /* 拉不到规则时前端不预检,服务端拦截兜底 */
  }
}

/* ---- 消息路由 ---- */

function routeMessage(msg: ServerMessage): void {
  const seq = (msg as { seq?: number }).seq
  if (typeof seq === 'number' && seq > lastSeq && seq > 0) lastSeq = seq

  if (msg.type === 'raw') {
    truthLayer.feed(msg.data)
    return
  }
  if (msg.type === 'completion') {
    onCompletion?.(msg)
    return
  }
  if (msg.type === 'ready') {
    useStore.getState().setConnStatus('ready')
    useStore.getState().handleServer(msg)
    if (msg.resumed) {
      resumedOnce = true
      saveSessionId(msg.sessionId)
    } else {
      // 新会话:旧状态(真相层/聊天层/会话 id)全部作废
      resumedOnce = false
      lastSeq = 0
      clearSessionId()
      saveSessionId(msg.sessionId)
      truthLayer.reset()
      useStore.getState().reset()
      useStore.getState().handleServer(msg)
    }
    return
  }
  if (msg.type === 'replay') {
    if (msg.raw) truthLayer.feed(msg.raw)
    for (const ev of msg.events) routeMessage(ev)
    return
  }
  useStore.getState().handleServer(msg)
}

/** 补全响应的订阅方(InputBar 挂载时注册) */
export let onCompletion: ((msg: Extract<ServerMessage, { type: 'completion' }>) => void) | null =
  null
export function setCompletionHandler(
  h: ((msg: Extract<ServerMessage, { type: 'completion' }>) => void) | null,
): void {
  onCompletion = h
}

export const net = new WsClient(
  (msg) => routeMessage(msg),
  (status) => useStore.getState().setConnStatus(status),
  // 连接建立:立即 attach(有上次会话 id 则尝试续接)
  () => {
    const saved = loadSessionId()
    net.send({
      type: 'attach',
      sessionId: saved,
      lastSeq: saved ? lastSeq : 0,
      wantRaw: saved ? !resumedOnce && !truthLayer.hasContent : false,
    })
  },
)

export interface SessionInfo {
  id: string
  createdAt: number
  lastActiveAt: number
  cwd: string
  connected: boolean
  sandboxMode: 'none' | 'bwrap'
  /** 用户自定义会话名(终端名);空 = 前端回退设备名/SSH 目标 */
  name: string
  /** 当前 SSH 连接目标(若有) */
  sshTarget: { user: string; host: string; port: number } | null
}

/** 会话重命名(终端名);改的是当前会话时本地即时生效(服务端无回执) */
export function renameSession(sessionId: string, name: string): void {
  net.send({ type: 'rename', sessionId, name })
  if (sessionId === loadSessionId()) {
    useStore.getState().setSessionName(name)
  }
}

export function currentSessionId(): string | null {
  return loadSessionId()
}

function clearViewForSessionChange(): void {
  lastSeq = 0
  resumedOnce = false
  truthLayer.reset()
  useStore.getState().reset()
}

export async function listSessions(): Promise<SessionInfo[]> {
  const res = await apiFetch('/api/sessions')
  if (!res.ok) throw new Error('无法加载会话列表')
  return (await res.json()) as SessionInfo[]
}

export async function createSession(): Promise<SessionInfo> {
  const res = await apiFetch('/api/sessions', { method: 'POST' })
  if (!res.ok) throw new Error('无法创建会话')
  return (await res.json()) as SessionInfo
}

/* ---- SSH 会话与连接历史 ---- */

export interface SshHost {
  user: string
  host: string
  port: number
  lastUsedAt: number
  times: number
}

export interface SshTargetInput {
  user: string
  host: string
  port: number
}

/** 解析用户输入:user@host[:port]、host[:port]、user@host -p port */
export function parseSshTargetInput(input: string): SshTargetInput | null {
  const m = input
    .trim()
    .match(/^(?:([^@\s]+)@)?([^@\s:]+)(?::(\d+))?(?:\s+-p\s+(\d+))?$/)
  if (!m || !m[2]) return null
  return { user: m[1] ?? '', host: m[2]!, port: Number(m[3] ?? m[4] ?? 22) || 22 }
}

/** 新建 SSH 会话(服务端解析目标并自动执行 ssh;同时记录历史) */
export async function createSshSession(target: SshTargetInput): Promise<SessionInfo> {
  const res = await apiFetch('/api/sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'ssh', ...target }),
  })
  if (!res.ok) throw new Error('无法创建 SSH 会话')
  return (await res.json()) as SessionInfo
}

export async function listSshHosts(): Promise<SshHost[]> {
  const res = await apiFetch('/api/ssh-hosts')
  if (!res.ok) throw new Error('无法加载 SSH 历史')
  return (await res.json()) as SshHost[]
}

export async function recordSshHost(host: { user: string; host: string; port: number }): Promise<SshHost[]> {
  const res = await apiFetch('/api/ssh-hosts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(host),
  })
  if (!res.ok) throw new Error('无法记录 SSH 历史')
  return (await res.json()) as SshHost[]
}

export async function removeSshHost(host: { user: string; host: string; port: number }): Promise<SshHost[]> {
  const res = await apiFetch('/api/ssh-hosts', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(host),
  })
  if (!res.ok) throw new Error('无法删除 SSH 历史')
  return (await res.json()) as SshHost[]
}

export async function closeSession(id: string): Promise<void> {
  const res = await apiFetch(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) throw new Error('无法关闭会话')
}

export function switchSession(id: string | null): void {
  if (id) saveSessionId(id)
  else clearSessionId()
  clearViewForSessionChange()
  net.restart()
}

/** 启动时从服务端取设置与危险规则 */
export async function hydrateFromServer(): Promise<void> {
  void loadDangerRules()
  await hydrateSettingsFromServer()
}
