/**
 * 设置弹窗:
 * 1. 外观模式
 * 2. 头像设置 (第二顺位)
 * 3. 气泡配色
 * 4. 终端排版与配色 (配色方案、字体、字号、实时预览)
 * 5. 界面语言切换 (置于最底部)
 * 纯单语言清晰描述,不中英文混杂。
 */

import { useRef, useState, type ChangeEvent } from 'react'
import {
  useSettings,
  type ThemeMode,
  type AvatarCfg,
  type BubbleTheme,
  COLOR_SCHEMES,
} from '../settings'
import { t, type Language } from '../i18n'
import { Avatar } from './Avatar'

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="px-1 pb-1 pt-4 text-[12px] font-medium text-ink-2">{children}</div>
}

function AvatarRow({
  label,
  cfg,
  kind,
  lang,
  onChange,
}: {
  label: string
  cfg: AvatarCfg
  kind: 'user' | 'term'
  lang: Language
  onChange: (a: AvatarCfg) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState('')
  const texts = t(lang)

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.size > 1024 * 1024) {
      setErr(texts.avatarSizeError)
      return
    }
    if (!f.type.startsWith('image/')) {
      setErr(texts.avatarTypeError)
      return
    }
    setErr('')
    const reader = new FileReader()
    reader.onload = () => onChange({ kind: 'image', value: String(reader.result) })
    reader.readAsDataURL(f)
  }

  return (
    <div className="border-t border-line/70 px-1 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar cfg={cfg} kind={kind} className="h-12 w-12" />
          <span className="text-[14px]">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-line px-2.5 py-1 text-[11px] text-ink-2 transition-colors hover:border-ink-2/50 hover:text-ink"
          >
            {texts.avatarUpload}
          </button>
          <button
            onClick={() => onChange(null)}
            className="rounded-lg px-2.5 py-1 text-[11px] text-ink-2 transition-colors hover:text-ink"
          >
            {texts.avatarDefault}
          </button>
        </div>
      </div>
      {err && <div className="text-danger mt-1 text-[11px]">{err}</div>}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
    </div>
  )
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const {
    theme,
    setTheme,
    bubbleTheme,
    setBubbleTheme,
    colorScheme,
    setColorScheme,
    language,
    setLanguage,
    fontSize,
    setFontSize,
    fontFamily,
    setFontFamily,
    userAvatar,
    setUserAvatar,
    termAvatar,
    setTermAvatar,
  } = useSettings()

  const tr = t(language)

  const themeOptions: Array<{ value: ThemeMode; label: string; icon: string }> = [
    { value: 'light', label: tr.themeLight, icon: '☀️' },
    { value: 'dark', label: tr.themeDark, icon: '🌙' },
    { value: 'auto', label: tr.themeAuto, icon: '🖥️' },
  ]

  const bubbleOptions: Array<{
    value: BubbleTheme
    label: string
    out: string
    outInk: string
    inn: string
    bg: string
  }> = [
    { value: 'wechat', label: tr.bubbleWechat, out: '#07c160', outInk: '#ffffff', inn: '#ffffff', bg: '#f7f7f7' },
    { value: 'whatsapp', label: tr.bubbleWhatsapp, out: '#d9fdd3', outInk: '#111b21', inn: '#ffffff', bg: '#efeae2' },
    { value: 'imessage', label: tr.bubbleImessage, out: '#0b93f6', outInk: '#ffffff', inn: '#e9e9eb', bg: '#ffffff' },
  ]

  const fontOptions = [
    { value: 'default', label: tr.fontDefault },
    { value: 'JetBrains Mono', label: 'JetBrains Mono' },
    { value: 'Fira Code', label: 'Fira Code' },
    { value: 'Cascadia Code', label: 'Cascadia Code' },
    { value: 'Source Code Pro', label: 'Source Code Pro' },
    { value: 'monospace', label: tr.fontMonospace },
  ]

  const langOptions: Array<{ value: Language; label: string }> = [
    { value: 'zh', label: tr.langZh },
    { value: 'en', label: tr.langEn },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-lg rounded-2xl border border-line bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-[16px] font-semibold">{tr.settingsTitle}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink"
            aria-label="关闭"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="max-h-[78vh] overflow-y-auto px-5 pb-6">
          {/* 1. 外观模式 */}
          <SectionTitle>{tr.appearance}</SectionTitle>
          <div className="grid grid-cols-3 gap-2">
            {themeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                className={
                  'flex items-center justify-center gap-1.5 rounded-xl border py-2 text-[13px] transition-colors ' +
                  (theme === opt.value
                    ? 'border-brand bg-brand-bg text-brand-deep font-medium'
                    : 'border-line text-ink-2 hover:border-ink-2/40 hover:text-ink')
                }
              >
                <span>{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>

          {/* 2. 头像设置 (第二顺位) */}
          <SectionTitle>{tr.avatars}</SectionTitle>
          <div className="-mx-1">
            <AvatarRow label={tr.avatarUser} cfg={userAvatar} kind="user" lang={language} onChange={setUserAvatar} />
            <AvatarRow label={tr.avatarTerm} cfg={termAvatar} kind="term" lang={language} onChange={setTermAvatar} />
          </div>

          {/* 3. 气泡配色 */}
          <SectionTitle>{tr.bubbleTheme}</SectionTitle>
          <div className="flex gap-2">
            {bubbleOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setBubbleTheme(opt.value)}
                className={
                  'flex flex-1 flex-col items-center gap-1.5 rounded-xl border py-2.5 transition-colors ' +
                  (bubbleTheme === opt.value
                    ? 'border-brand bg-brand-bg text-brand-deep'
                    : 'border-line text-ink-2 hover:border-ink-2/40 hover:text-ink')
                }
                aria-pressed={bubbleTheme === opt.value}
              >
                {/* 迷你对话预览 */}
                <div className="flex w-full items-center gap-1 px-2" style={{ background: opt.bg }}>
                  <span
                    className="flex h-4 items-center rounded-md rounded-bl-[2px] px-1.5"
                    style={{ background: opt.inn }}
                  />
                  <span
                    className="ml-auto flex h-4 w-8 items-center justify-center rounded-md rounded-br-[2px] px-1.5"
                    style={{ background: opt.out, color: opt.outInk }}
                  >
                    <span className="text-[8px] leading-none">❯</span>
                  </span>
                </div>
                <span className={'text-[12px]' + (bubbleTheme === opt.value ? ' font-medium' : '')}>
                  {opt.label}
                </span>
              </button>
            ))}
          </div>

          {/* 4. 终端排版与配色 */}
          <SectionTitle>{tr.typographyAndColors}</SectionTitle>
          <div className="rounded-xl border border-line bg-canvas/60 p-3.5 space-y-3.5">
            {/* 配色方案选择 */}
            <div>
              <div className="mb-2 text-[11px] font-medium text-ink-2">{tr.colorScheme}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.values(COLOR_SCHEMES).map((scheme) => (
                  <button
                    key={scheme.id}
                    onClick={() => setColorScheme(scheme.id)}
                    className={
                      'flex flex-col gap-1.5 rounded-xl border p-2 text-left transition-colors ' +
                      (colorScheme === scheme.id
                        ? 'border-brand bg-brand-bg text-brand-deep font-medium'
                        : 'border-line bg-panel text-ink hover:border-ink-2/40')
                    }
                  >
                    <span className="text-[11px] truncate">{tr[scheme.nameKey]}</span>
                    <div className="flex items-center gap-1">
                      {scheme.preview.map((hex, idx) => (
                        <span
                          key={idx}
                          className="h-2.5 w-2.5 rounded-full border border-black/10 shadow-xs"
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 字体选择 */}
            <div>
              <div className="mb-1 text-[11px] font-medium text-ink-2">{tr.fontFamily}</div>
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                className="w-full rounded-xl border border-line bg-panel px-3 py-1.5 text-xs text-ink outline-none focus:border-brand"
              >
                {fontOptions.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 字号滑块 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-ink-2">{tr.fontSize}</span>
                <span className="font-mono-term text-[11px] text-ink-2">{fontSize}px</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-ink-2">{tr.fontSizeSmall}</span>
                <input
                  type="range"
                  min={11}
                  max={22}
                  step={0.5}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="accent-brand flex-1"
                  aria-label={tr.fontSize}
                />
                <span className="text-[11px] text-ink-2">{tr.fontSizeLarge}</span>
              </div>
            </div>

            {/* 实时终端彩色预览卡片 */}
            <div>
              <div className="mb-1.5 text-[11px] font-medium text-ink-2">{tr.livePreview}</div>
              <div className="rounded-lg border border-line bg-panel p-3 shadow-inner">
                <pre className="font-mono-term term-fs leading-relaxed overflow-x-auto text-ink">
                  <div><span className="text-brand-deep font-semibold">user@kissa:~/project$</span> ls -la</div>
                  <div style={{ color: 'var(--term-color-4)', fontWeight: 'bold' }}>drwxr-xr-x  src/      docs/      assets/</div>
                  <div style={{ color: 'var(--term-color-2)' }}>-rwxr-xr-x  start.sh*   build.sh*</div>
                  <div style={{ color: 'var(--term-color-1)' }}>-rw-r--r--  bundle.tar.gz   backup.zip</div>
                  <div style={{ color: 'var(--term-color-3)' }}>-rw-r--r--  package.json    tsconfig.json</div>
                  <div style={{ color: 'var(--term-color-6)' }}>lrwxrwxrwx  latest -&gt; dist/v2.0</div>
                  <div className="opacity-80">-rw-r--r--  README.md   LICENSE</div>
                  <div className="mt-1"><span style={{ color: 'var(--term-color-3)' }}>{tr.previewWarn}</span></div>
                </pre>
              </div>
            </div>
          </div>

          {/* 5. 界面语言切换 (置于最底部) */}
          <SectionTitle>{tr.language}</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            {langOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setLanguage(opt.value)}
                className={
                  'flex items-center justify-center gap-1.5 rounded-xl border py-2 text-[13px] transition-colors ' +
                  (language === opt.value
                    ? 'border-brand bg-brand-bg text-brand-deep font-medium'
                    : 'border-line text-ink-2 hover:border-ink-2/40 hover:text-ink')
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
