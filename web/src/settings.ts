/**
 * 设置(主题 / 配色方案 / 语言 / 头像 / 终端字号 / 字体),持久化到 localStorage 与服务端。
 * 主题与字号在 App 中以副作用应用到 <html>;组件层只读 store。
 */

import { create } from 'zustand'
import { apiFetch } from './auth'
import type { Language } from './i18n'

export type ThemeMode = 'light' | 'dark' | 'auto'

/** 气泡配色风格:微信 / WhatsApp / iMessage */
export type BubbleTheme = 'wechat' | 'whatsapp' | 'imessage'

export type ColorSchemeId = 'default' | 'dracula' | 'one-dark' | 'monokai' | 'nord' | 'solarized'

export interface ColorSchemeDef {
  id: ColorSchemeId
  nameKey: 'schemeDefault' | 'schemeDracula' | 'schemeOneDark' | 'schemeMonokai' | 'schemeNord' | 'schemeSolarized'
  /** 6 个代表色 (Red, Green, Yellow, Blue, Magenta, Cyan) 用于预览 */
  preview: string[]
  colors: {
    light: string[]
    dark: string[]
  }
}

export const COLOR_SCHEMES: Record<ColorSchemeId, ColorSchemeDef> = {
  default: {
    id: 'default',
    nameKey: 'schemeDefault',
    preview: ['#c72e2e', '#0b8f51', '#9b7200', '#1565c0', '#8e24aa', '#00838f'],
    colors: {
      light: [
        '#1e1e1e', '#c72e2e', '#0b8f51', '#9b7200', '#1565c0', '#8e24aa', '#00838f', '#616161',
        '#9e9e9e', '#e53935', '#1b5e20', '#b28704', '#0277bd', '#ab47bc', '#00acc1', '#212121',
      ],
      dark: [
        '#282c34', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#abb2bf',
        '#5c6370', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#ffffff',
      ],
    },
  },
  dracula: {
    id: 'dracula',
    nameKey: 'schemeDracula',
    preview: ['#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd'],
    colors: {
      light: [
        '#282a36', '#ea5555', '#38b45c', '#c9a800', '#7b5cd6', '#c94488', '#0097a7', '#44475a',
        '#6272a4', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2',
      ],
      dark: [
        '#21222c', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2',
        '#6272a4', '#ff6e6e', '#69ff94', '#ffffa5', '#d6acff', '#ff92df', '#a4ffff', '#ffffff',
      ],
    },
  },
  'one-dark': {
    id: 'one-dark',
    nameKey: 'schemeOneDark',
    preview: ['#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2'],
    colors: {
      light: [
        '#282c34', '#ca3743', '#4a9c39', '#b58410', '#2574bd', '#9238ab', '#197f8c', '#5c6370',
        '#828997', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#282c34',
      ],
      dark: [
        '#282c34', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#abb2bf',
        '#4b5263', '#be5046', '#98c379', '#d19a66', '#61afef', '#c678dd', '#56b6c2', '#ffffff',
      ],
    },
  },
  monokai: {
    id: 'monokai',
    nameKey: 'schemeMonokai',
    preview: ['#f92672', '#a6e22e', '#f4bf75', '#66d9ef', '#ae81ff', '#a1efe4'],
    colors: {
      light: [
        '#272822', '#d31c5b', '#6b9e14', '#b3820a', '#178bb0', '#774ab5', '#169986', '#75715e',
        '#8f8b7b', '#f92672', '#a6e22e', '#f4bf75', '#66d9ef', '#ae81ff', '#a1efe4', '#272822',
      ],
      dark: [
        '#272822', '#f92672', '#a6e22e', '#f4bf75', '#66d9ef', '#ae81ff', '#a1efe4', '#f8f8f2',
        '#75715e', '#ff4d8d', '#bdf448', '#ffe08a', '#85e5ff', '#c29eff', '#befff7', '#ffffff',
      ],
    },
  },
  nord: {
    id: 'nord',
    nameKey: 'schemeNord',
    preview: ['#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#88c0d0'],
    colors: {
      light: [
        '#2e3440', '#9f3a44', '#5e8248', '#a37e28', '#4c739e', '#885880', '#3b7a8a', '#4c566a',
        '#76849e', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#88c0d0', '#2e3440',
      ],
      dark: [
        '#2e3440', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#88c0d0', '#e5e9f0',
        '#4c566a', '#d08770', '#a3be8c', '#ebcb8b', '#88c0d0', '#b48ead', '#8fbcbb', '#eceff4',
      ],
    },
  },
  solarized: {
    id: 'solarized',
    nameKey: 'schemeSolarized',
    preview: ['#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198'],
    colors: {
      light: [
        '#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#657b83',
        '#586e75', '#cb4b16', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#073642',
      ],
      dark: [
        '#002b36', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#839496',
        '#586e75', '#cb4b16', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#93a1a1',
      ],
    },
  },
}

export type AvatarCfg =
  | { kind: 'emoji'; value: string }
  | { kind: 'image'; value: string } // dataURL
  | null

export interface SettingsState {
  theme: ThemeMode
  /** 气泡配色风格(与浅/深外观正交) */
  bubbleTheme: BubbleTheme
  /** 终端配色方案 */
  colorScheme: ColorSchemeId
  /** 界面语言 */
  language: Language
  /** 终端内容字号(px),作用于命令/输出/输入框/补全/终端视图 */
  fontSize: number
  /** 终端等宽字体 */
  fontFamily: string
  userAvatar: AvatarCfg
  termAvatar: AvatarCfg
  /** 系统用户头像是否可用(运行时探测,不持久化) */
  sysAvatarAvailable: boolean
  setTheme: (t: ThemeMode) => void
  setBubbleTheme: (b: BubbleTheme) => void
  setColorScheme: (c: ColorSchemeId) => void
  setLanguage: (l: Language) => void
  setFontSize: (n: number) => void
  setFontFamily: (f: string) => void
  setUserAvatar: (a: AvatarCfg) => void
  setTermAvatar: (a: AvatarCfg) => void
  setSysAvatarAvailable: (v: boolean) => void
}

const KEY = 'kissa.settings'
const OLD_KEY = 'liminal.settings'
const DEFAULTS = {
  theme: 'light' as ThemeMode,
  bubbleTheme: 'wechat' as BubbleTheme,
  colorScheme: 'default' as ColorSchemeId,
  language: 'zh' as Language,
  fontSize: 13.5,
  fontFamily: 'default',
  userAvatar: null,
  termAvatar: null,
}

function load(): typeof DEFAULTS {
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<typeof DEFAULTS>
    return {
      ...DEFAULTS,
      ...parsed,
      fontSize: Math.min(22, Math.max(11, Number(parsed.fontSize) || DEFAULTS.fontSize)),
      fontFamily: typeof parsed.fontFamily === 'string' ? parsed.fontFamily : DEFAULTS.fontFamily,
      language: parsed.language === 'en' ? 'en' : 'zh',
      colorScheme:
        typeof parsed.colorScheme === 'string' && parsed.colorScheme in COLOR_SCHEMES
          ? (parsed.colorScheme as ColorSchemeId)
          : DEFAULTS.colorScheme,
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
    setColorScheme: (colorScheme) => set({ colorScheme }),
    setLanguage: (language) => set({ language }),
    setFontSize: (fontSize) => set({ fontSize }),
    setFontFamily: (fontFamily) => set({ fontFamily }),
    setUserAvatar: (userAvatar) => set({ userAvatar }),
    setTermAvatar: (termAvatar) => set({ termAvatar }),
    setSysAvatarAvailable: (sysAvatarAvailable) => set({ sysAvatarAvailable }),
  }
})

// 任一设置变更即落盘:localStorage 作缓存,服务端文件为准
useSettings.subscribe((s) => {
  const snapshot = {
    theme: s.theme,
    bubbleTheme: s.bubbleTheme,
    colorScheme: s.colorScheme,
    language: s.language,
    fontSize: s.fontSize,
    fontFamily: s.fontFamily,
    userAvatar: s.userAvatar,
    termAvatar: s.termAvatar,
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot))
  } catch {
    /* 存储满等情况:放弃缓存,仅服务端持久化 */
  }
  scheduleServerSave(snapshot)
})

/* ---- 服务端同步 ---- */

interface Snapshot {
  theme: ThemeMode
  bubbleTheme: BubbleTheme
  colorScheme: ColorSchemeId
  language: Language
  fontSize: number
  fontFamily: string
  userAvatar: AvatarCfg
  termAvatar: AvatarCfg
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let lastSaved: string | null = null

/** 防抖保存 */
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

/** 启动时从服务端取设置 */
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
      colorScheme:
        remote.colorScheme !== undefined && remote.colorScheme in COLOR_SCHEMES
          ? (remote.colorScheme as ColorSchemeId)
          : cur.colorScheme,
      language: remote.language === 'en' ? 'en' : cur.language,
      fontSize:
        typeof remote.fontSize === 'number'
          ? Math.min(22, Math.max(11, remote.fontSize))
          : cur.fontSize,
      fontFamily: typeof remote.fontFamily === 'string' ? remote.fontFamily : cur.fontFamily,
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
    colorScheme: s.colorScheme,
    language: s.language,
    fontSize: s.fontSize,
    fontFamily: s.fontFamily,
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

export function applyFontFamily(fontFamily: string): void {
  if (!fontFamily || fontFamily === 'default') {
    document.documentElement.style.removeProperty('--font-mono-term')
  } else {
    document.documentElement.style.setProperty(
      '--font-mono-term',
      `"${fontFamily}", "JetBrains Mono", "Fira Code", ui-monospace, "Cascadia Code", monospace`,
    )
  }
}

export function applyColorScheme(schemeId: ColorSchemeId, mode: ThemeMode): void {
  const dark =
    mode === 'dark' ||
    (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const scheme = COLOR_SCHEMES[schemeId] ?? COLOR_SCHEMES.default
  const colors = dark ? scheme.colors.dark : scheme.colors.light

  for (let i = 0; i < 16; i++) {
    const val = colors[i]
    if (val) {
      document.documentElement.style.setProperty(`--term-color-${i}`, val)
    }
  }
}
