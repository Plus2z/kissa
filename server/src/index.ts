/**
 * kissa 服务端入口。
 *
 * - /ws:连接后客户端发 attach 续接会话(或隐式新建);断线后会话保活 30 分钟
 * - /api/settings、/api/danger-rules、/api/user-avatar
 * - 静态托管 web/dist(生产模式);开发模式下前端由 Vite 提供并代理 /ws 与 /api
 */

import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import { existsSync } from 'node:fs'
import { timingSafeEqual } from 'node:crypto'
import { hostname } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import fastifyStatic from '@fastify/static'
import type { ClientMessage } from './protocol.js'
import { Session } from './sessions.js'
import { readSettings, writeSettings } from './settingsFile.js'
import { findSystemUserAvatar } from './userAvatar.js'
import { DANGER_RULES, matchDanger } from './dangerRules.js'
import { parseSshTarget, type SshTarget } from './ssh.js'
import { listSshHosts, recordSshHost, removeSshHost } from './sshHosts.js'

const PORT = Number(process.env.PORT ?? 7788)
const HOST = process.env.HOST ?? '127.0.0.1'

const __dirname = dirname(fileURLToPath(import.meta.url))
const webDist = join(__dirname, '../../web/dist')

const app = Fastify({ logger: { level: 'info' } })
await app.register(websocket)

const AUTH_TOKEN = process.env.KISSA_AUTH_TOKEN ?? process.env.LIMINAL_AUTH_TOKEN ?? ''

function requestToken(request: { headers: Record<string, string | string[] | undefined>; raw: { url?: string } }): string {
  const header = request.headers['x-kissa-token'] ?? request.headers['x-liminal-token']
  if (typeof header === 'string') return header
  try {
    return new URL(request.raw.url ?? '/', 'http://kissa.local').searchParams.get('token') ?? ''
  } catch {
    return ''
  }
}

function tokenMatches(candidate: string): boolean {
  if (!AUTH_TOKEN) return true
  const actual = Buffer.from(AUTH_TOKEN)
  const supplied = Buffer.from(candidate)
  return actual.length === supplied.length && timingSafeEqual(actual, supplied)
}

// 静态资源可公开读取；所有 API 与 WS 入口在设置令牌时必须通过认证。
app.addHook('onRequest', async (request, reply) => {
  if (!AUTH_TOKEN || (!request.url.startsWith('/api/') && !request.url.startsWith('/ws'))) return
  if (tokenMatches(requestToken(request))) return
  reply.code(401).send({ error: 'unauthorized' })
})

if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist })
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/ws') || req.url.startsWith('/api')) {
      reply.code(404).send({ error: 'no such route' })
      return
    }
    reply.sendFile('index.html')
  })
}

// 用户设置:磁盘持久化(桌面版端口每次随机,localStorage 不可靠)
app.get('/api/settings', async () => readSettings())
app.put('/api/settings', { bodyLimit: 4 * 1024 * 1024 }, async (req, reply) => {
  const saved = writeSettings(req.body)
  reply.send(saved)
})

// 危险命令规则:前后端共用同一份(前端发送前确认,服务端未确认即阻断)
app.get('/api/danger-rules', async () => DANGER_RULES)

// 系统用户头像(默认用户头像的来源);找不到返回 404,前端回退内置样式
app.get('/api/user-avatar', (_req, reply) => {
  const avatar = findSystemUserAvatar()
  if (!avatar) return reply.code(404).send()
  reply.header('content-type', avatar.contentType).send(avatar.data)
})

/* ---- 会话注册表与 WS 路由 ---- */

const sessions = new Map<string, Session>()
function disposeSession(s: Session): void {
  sessions.delete(s.id)
}

function createSession(opts?: { sshTarget?: SshTarget }): Session {
  const session = new Session(disposeSession, opts)
  sessions.set(session.id, session)
  return session
}

app.get('/api/sessions', async () =>
  [...sessions.values()]
    .map((session) => session.summary())
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt),
)

app.post('/api/sessions', async (request, reply) => {
  const body = (request.body ?? {}) as {
    type?: string
    target?: string
    user?: unknown
    host?: unknown
    port?: unknown
  }
  if (body.type === 'ssh') {
    // 新建 SSH 会话:解析目标并自动执行 ssh;同时记录历史。
    // 支持结构化 { user, host, port }(前端解析 user@host[:port])或字符串 target(标准 ssh 语法)
    let sshTarget: SshTarget | null = null
    if (typeof body.host === 'string' && body.host.trim()) {
      sshTarget = {
        user: typeof body.user === 'string' ? body.user : '',
        host: body.host.trim(),
        port: typeof body.port === 'number' && body.port > 0 ? body.port : 22,
      }
    } else if (typeof body.target === 'string' && body.target.trim()) {
      sshTarget = parseSshTarget(`ssh ${body.target.trim()}`)
    }
    if (!sshTarget) {
      return reply.code(400).send({ error: 'invalid ssh target' })
    }
    recordSshHost(sshTarget)
    const session = createSession({ sshTarget })
    return reply.code(201).send(session.summary())
  }
  const session = createSession()
  reply.code(201).send(session.summary())
})

/* ---- SSH 连接历史 ---- */

app.get('/api/ssh-hosts', async () => listSshHosts())

app.post('/api/ssh-hosts', async (request, reply) => {
  const body = (request.body ?? {}) as { user?: unknown; host?: unknown; port?: unknown }
  const user = typeof body.user === 'string' ? body.user : ''
  const host = typeof body.host === 'string' ? body.host : ''
  const port = typeof body.port === 'number' && body.port > 0 ? body.port : 22
  if (!host) return reply.code(400).send({ error: 'host required' })
  return recordSshHost({ user, host, port })
})

app.delete('/api/ssh-hosts', async (request, reply) => {
  const body = (request.body ?? {}) as { user?: unknown; host?: unknown; port?: unknown }
  const user = typeof body.user === 'string' ? body.user : ''
  const host = typeof body.host === 'string' ? body.host : ''
  const port = typeof body.port === 'number' && body.port > 0 ? body.port : 22
  if (!host) return reply.code(400).send({ error: 'host required' })
  return removeSshHost({ user, host, port })
})

app.delete('/api/sessions/:id', async (request, reply) => {
  const id = (request.params as { id?: string }).id
  const session = id ? sessions.get(id) : undefined
  if (!session) return reply.code(404).send({ error: 'session not found' })
  session.dispose()
  return reply.code(204).send()
})

function sendReady(socket: { send: (p: string) => void }, s: Session, resumed: boolean): void {
  socket.send(
    JSON.stringify({
      type: 'ready',
      sessionId: s.id,
      resumed,
      cols: 80,
      rows: 24,
      shell: process.env.SHELL ?? '/bin/bash',
      hostname: hostname(),
      seq: 0, // ready 不占会话序号空间,由客户端特殊处理
    }),
  )
}

app.get('/ws', { websocket: true }, (socket) => {
  let session: Session | null = null
  const sockSend = (payload: string) => socket.send(payload)

  const ensureSession = (): Session => {
    if (!session) {
      session = createSession()
      session.attach(sockSend, 0, false)
      sendReady(socket, session, false)
    }
    return session
  }

  socket.on('message', (raw: Buffer) => {
    let msg: ClientMessage
    try {
      msg = JSON.parse(raw.toString('utf8')) as ClientMessage
    } catch {
      return
    }
    switch (msg.type) {
      case 'attach': {
        if (session) return // 已绑定
        const existing = msg.sessionId ? sessions.get(msg.sessionId) : undefined
        if (existing) {
          session = existing
          const missed = existing.attach(sockSend, msg.lastSeq, msg.wantRaw)
          sendReady(socket, existing, true)
          socket.send(
            JSON.stringify({
              type: 'replay',
              raw: msg.wantRaw ? Buffer.from(existing.rawBacklog(), 'utf8').toString('base64') : '',
              events: missed,
            }),
          )
        } else {
          ensureSession()
        }
        break
      }
      case 'command': {
        const s = ensureSession()
        const rule = matchDanger(msg.text)
        if (rule && msg.confirmed !== true) {
          s.sendSystem(`⛔ 已拦截危险命令(未确认):${rule.message}。命令未执行。`)
          app.log.warn({ rule: rule.id }, 'blocked dangerous command')
          return
        }
        if (rule) {
          s.sendSystem(`⚠️ 危险命令已确认执行:${rule.message}`)
        }
        s.writeCommand(msg.text)
        break
      }
      case 'stdin':
        ensureSession().writeStdin(msg.data)
        break
      case 'resize':
        ensureSession().resize(msg.cols, msg.rows)
        break
      case 'complete': {
        const s = ensureSession()
        s.complete(msg.token, msg.text, msg.cursor)
        break
      }
      case 'rename': {
        const s = msg.sessionId ? sessions.get(msg.sessionId) : undefined
        if (s) s.rename(msg.name)
        break
      }
      default:
        socket.send(JSON.stringify({ type: 'error', text: `未知消息类型:${(msg as { type: string }).type}` }))
    }
  })

  // 断线:会话保活(30 分钟空闲回收),不销毁
  socket.on('close', () => {
    session?.detach()
  })
})

// 优雅退出:销毁全部会话(杀 PTY/bash)
const shutdown = () => {
  for (const s of sessions.values()) s.dispose()
}
process.on('SIGTERM', () => {
  shutdown()
  process.exit(0)
})
process.on('SIGINT', () => {
  shutdown()
  process.exit(0)
})

app.listen({ port: PORT, host: HOST }).then(() => {
  app.log.info(`kissa server listening on ws://${HOST}:${PORT}/ws`)
})
