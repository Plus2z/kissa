/**
 * 设置(主题 / 头像 / 终端字号),持久化到 localStorage。
 * 主题与字号在 App 中以副作用应用到 <html>;组件层只读 store。
 */

import { create } from 'zustand'
import { apiFetch } from './auth'

export type ThemeMode = 'light' | 'dark' | 'auto'

/** 气泡配色风格:微信 / WhatsApp / iMessage */
export type BubbleTheme = 'wechat' | 'whatsapp' | 'imessage'

export type AvatarCfg =
  | { kind: 'emoji'; value: string }
  | { kind: 'image'; value: string } // dataURL
  | null

export interface SettingsState {
  theme: ThemeMode
  /** 气泡配色风格(与浅/深外观正交) */
  bubbleTheme: BubbleTheme
  /** 终端内容字号(px),作用于命令/输出/输入框/补全/终端视图 */
  fontSize: number
  userAvatar: AvatarCfg
  termAvatar: AvatarCfg
  /** 系统用户头像是否可用(运行时探测,不持久化) */
  sysAvatarAvailable: boolean
  setTheme: (t: ThemeMode) => void
  setBubbleTheme: (b: BubbleTheme) => void
  setFontSize: (n: number) => void
  setUserAvatar: (a: AvatarCfg) => void
  setTermAvatar: (a: AvatarCfg) => void
  setSysAvatarAvailable: (v: boolean) => void
}

const KEY = 'liminal.settings'
const DEFAULTS = {
  theme: 'light' as ThemeMode,
  bubbleTheme: 'wechat' as BubbleTheme,
  fontSize: 13.5,
  userAvatar: null,
  termAvatar: null,
}

function load(): typeof DEFAULTS {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<typeof DEFAULTS>
    return {
      ...DEFAULTS,
      ...parsed,
      fontSize: Math.min(22, Math.max(11, Number(parsed.fontSize) || DEFAULTS.fontSize)),
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export const useSettings = create<SettingsState>()((set) => {
  const init = load()
  return {
    ...init,
    sysAvatarAvailable: false,
    setTheme: (theme) => set({ theme }),
    setBubbleTheme: (bubbleTheme) => set({ bubbleTheme }),
    setFontSize: (fontSize) => set({ fontSize }),
    setUserAvatar: (userAvatar) => set({ userAvatar }),
    setTermAvatar: (termAvatar) => set({ termAvatar }),
    setSysAvatarAvailable: (sysAvatarAvailable) => set({ sysAvatarAvailable }),
  }
})

// 任一设置变更即落盘:localStorage 作缓存,服务端文件为准(桌面版端口随机,
// localStorage 会随 origin 变化而丢失)
useSettings.subscribe((s) => {
  const snapshot = {
    theme: s.theme,
    bubbleTheme: s.bubbleTheme,
    fontSize: s.fontSize,
    userAvatar: s.userAvatar,
    termAvatar: s.termAvatar,
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot))
  } catch {
    /* 存储满(大图)等情况:放弃缓存,仅服务端持久化 */
  }
  scheduleServerSave(snapshot)
})

/* ---- 服务端同步 ---- */

interface Snapshot {
  theme: ThemeMode
  bubbleTheme: BubbleTheme
  fontSize: number
  userAvatar: AvatarCfg
  termAvatar: AvatarCfg
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let lastSaved: string | null = null

/** 防抖保存:头像图片可能几百 KB,避免每改一项就全量 PUT */
function scheduleServerSave(snapshot: Snapshot): void {
  const json = JSON.stringify(snapshot)
  if (json === lastSaved) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    saveTimer = null
    try {
      await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: json,
      })
      lastSaved = json
    } catch {
      /* 服务端不可达:保留 localStorage 缓存,下次变更再试 */
    }
  }, 300)
}

/** 启动时从服务端取设置(服务端为准;失败则退回 localStorage/默认值),并探测系统头像 */
export async function hydrateSettingsFromServer(): Promise<void> {
  try {
    const [res, avatarRes] = await Promise.all([
      apiFetch('/api/settings'),
      apiFetch('/api/user-avatar', { method: 'HEAD' }),
    ])
    useSettings.getState().setSysAvatarAvailable(avatarRes.ok)
    if (!res.ok) return
    const remote = (await res.json()) as Partial<Snapshot>
    const cur = useSettings.getState()
    useSettings.setState({
      theme: THEMES_VALID.has(remote.theme ?? '') ? (remote.theme as ThemeMode) : cur.theme,
      bubbleTheme:
        remote.bubbleTheme !== undefined && BUBBLES_VALID.has(remote.bubbleTheme)
          ? (remote.bubbleTheme as BubbleTheme)
          : cur.bubbleTheme,
      fontSize:
        typeof remote.fontSize === 'number'
          ? Math.min(22, Math.max(11, remote.fontSize))
          : cur.fontSize,
      userAvatar: sanitizeAvatar(remote.userAvatar) ?? cur.userAvatar,
      termAvatar: sanitizeAvatar(remote.termAvatar) ?? cur.termAvatar,
    })
    lastSaved = JSON.stringify(plainSnapshot(useSettings.getState()))
  } catch {
    /* 拿不到就用本地初始值 */
  }
}

const THEMES_VALID = new Set(['light', 'dark', 'auto'])
const BUBBLES_VALID = new Set(['wechat', 'whatsapp', 'imessage'])

function sanitizeAvatar(v: unknown): AvatarCfg | undefined {
  if (v === null) return null
  if (
    typeof v === 'object' &&
    v !== null &&
    ((v as { kind?: unknown }).kind === 'emoji' || (v as { kind?: unknown }).kind === 'image') &&
    typeof (v as { value?: unknown }).value === 'string' &&
    (v as { value: string }).value.length < 1_500_000
  ) {
    return v as AvatarCfg
  }
  return undefined
}

function plainSnapshot(s: ReturnType<typeof useSettings.getState>): Snapshot {
  return {
    theme: s.theme,
    bubbleTheme: s.bubbleTheme,
    fontSize: s.fontSize,
    userAvatar: s.userAvatar,
    termAvatar: s.termAvatar,
  }
}

/** 主题应用:'auto' 跟随系统;气泡配色独立于浅深外观 */
export function applyTheme(mode: ThemeMode, bubbles: BubbleTheme): void {
  const dark =
    mode === 'dark' ||
    (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.documentElement.dataset.bubbles = bubbles
}

export function applyFontSize(px: number): void {
  document.documentElement.style.setProperty('--term-fs', `${px}px`)
}
