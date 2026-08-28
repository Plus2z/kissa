/**
 * 用户设置的服务端持久化:~/.config/kissa/settings.json。
 *
 * 为什么不用 localStorage 就够了:桌面版每次启动用随机端口,端口一变
 * origin 就变,localStorage 随之丢失(头像每次都要重设的根因)。
 * 设置落到磁盘文件,通过 /api/settings 读写,与端口无关。
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const FILE = join(homedir(), '.config/kissa/settings.json')
const OLD_FILE = join(homedir(), '.config/liminal/settings.json')

export interface StoredSettings {
  theme?: string
  bubbleTheme?: string
  fontSize?: number
  fontFamily?: string
  colorScheme?: string
  language?: string
  userAvatar?: unknown
  termAvatar?: unknown
}

const THEMES = new Set(['light', 'dark', 'auto'])
const BUBBLES = new Set(['wechat', 'whatsapp', 'imessage'])
const FONTS = new Set(['default', 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Source Code Pro', 'monospace'])
const COLOR_SCHEMES = new Set(['default', 'dracula', 'one-dark', 'monokai', 'nord', 'solarized'])
const LANGUAGES = new Set(['zh', 'en'])

/** 校验并收敛为合法形状,非法字段静默丢弃 */
function sanitize(raw: unknown): StoredSettings {
  const out: StoredSettings = {}
  if (typeof raw !== 'object' || raw === null) return out
  const r = raw as Record<string, unknown>
  if (typeof r.theme === 'string' && THEMES.has(r.theme)) out.theme = r.theme
  if (typeof r.bubbleTheme === 'string' && BUBBLES.has(r.bubbleTheme)) out.bubbleTheme = r.bubbleTheme
  if (typeof r.fontFamily === 'string' && FONTS.has(r.fontFamily)) out.fontFamily = r.fontFamily
  if (typeof r.colorScheme === 'string' && COLOR_SCHEMES.has(r.colorScheme)) out.colorScheme = r.colorScheme
  if (typeof r.language === 'string' && LANGUAGES.has(r.language)) out.language = r.language
  if (typeof r.fontSize === 'number' && Number.isFinite(r.fontSize)) {
    out.fontSize = Math.min(22, Math.max(11, r.fontSize))
  }
  for (const key of ['userAvatar', 'termAvatar'] as const) {
    const v = r[key]
    if (v === null) {
      out[key] = null
    } else if (
      typeof v === 'object' &&
      v !== null &&
      ((v as { kind?: unknown }).kind === 'emoji' || (v as { kind?: unknown }).kind === 'image') &&
      typeof (v as { value?: unknown }).value === 'string' &&
      (v as { value: string }).value.length < 1_500_000
    ) {
      out[key] = v
    }
  }
  return out
}

export function readSettings(): StoredSettings {
  try {
    const targetFile = existsSync(FILE) ? FILE : existsSync(OLD_FILE) ? OLD_FILE : FILE
    return sanitize(JSON.parse(readFileSync(targetFile, 'utf8')))
  } catch {
    return {} // 首次使用或文件损坏:走默认值
  }
}

export function writeSettings(raw: unknown): StoredSettings {
  const s = sanitize(raw)
  const dir = dirname(FILE)
  mkdirSync(dir, { recursive: true })
  // 先写临时文件再原子改名,避免断电/崩溃留下半个 JSON
  const tmp = FILE + '.tmp'
  writeFileSync(tmp, JSON.stringify(s, null, 2))
  renameSync(tmp, FILE)
  return s
}
