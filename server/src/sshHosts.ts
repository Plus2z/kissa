/**
 * SSH 连接历史持久化:~/.config/liminal/ssh-hosts.json。
 *
 * 记录用户连接过的 SSH 目标(user@host[:port]),按最近使用排序,
 * 供"新建 SSH 连接"弹窗快捷选择。原子写(先临时文件再改名)。
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export interface SshHost {
  user: string
  host: string
  port: number
  lastUsedAt: number
  times: number
}

const FILE = join(homedir(), '.config/liminal/ssh-hosts.json')

/** 上限:防文件无限增长 */
const MAX_HOSTS = 50

function keyOf(h: { user: string; host: string; port: number }): string {
  return `${h.user}@${h.host}:${h.port}`
}

function isValid(v: unknown): v is SshHost {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o.host === 'string' &&
    o.host.length > 0 &&
    (typeof o.user === 'string' || o.user === undefined) &&
    typeof o.port === 'number'
  )
}

function read(): SshHost[] {
  try {
    const raw = JSON.parse(readFileSync(FILE, 'utf8')) as unknown
    if (!Array.isArray(raw)) return []
    return raw
      .filter(isValid)
      .map((h) => ({ user: h.user ?? '', host: h.host, port: h.port, lastUsedAt: h.lastUsedAt ?? 0, times: h.times ?? 1 }))
  } catch {
    return [] // 首次使用或文件损坏
  }
}

function write(list: SshHost[]): void {
  const dir = dirname(FILE)
  mkdirSync(dir, { recursive: true })
  const tmp = FILE + '.tmp'
  writeFileSync(tmp, JSON.stringify(list, null, 2))
  renameSync(tmp, FILE)
}

/** 按最近使用排序的历史列表 */
export function listSshHosts(): SshHost[] {
  return read().sort((a, b) => b.lastUsedAt - a.lastUsedAt)
}

/** 记录一次 SSH 使用(合并去重、计数、刷新时间);返回最新列表 */
export function recordSshHost(t: { user: string; host: string; port: number }): SshHost[] {
  const list = read()
  const key = keyOf(t)
  const idx = list.findIndex((h) => keyOf(h) === key)
  if (idx >= 0) {
    const h = list[idx]!
    list[idx] = { ...h, lastUsedAt: Date.now(), times: h.times + 1 }
  } else {
    list.push({ user: t.user, host: t.host, port: t.port, lastUsedAt: Date.now(), times: 1 })
  }
  const sorted = list.sort((a, b) => b.lastUsedAt - a.lastUsedAt).slice(0, MAX_HOSTS)
  write(sorted)
  return sorted
}

/** 删除一条历史;返回最新列表 */
export function removeSshHost(t: { user: string; host: string; port: number }): SshHost[] {
  const key = keyOf(t)
  const list = read().filter((h) => keyOf(h) !== key)
  write(list)
  return list.sort((a, b) => b.lastUsedAt - a.lastUsedAt)
}
