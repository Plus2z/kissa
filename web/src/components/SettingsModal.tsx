/**
 * 设置弹窗:主题(浅/深/跟随系统)、气泡配色、用户与终端头像(图片上传/默认)、
 * 终端字号(滑杆,实时生效并预览)。所有变更即时持久化(服务端 + localStorage)。
 */

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useSettings, type ThemeMode, type AvatarCfg, type BubbleTheme } from '../settings'
import { Avatar } from './Avatar'

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; icon: string }> = [
  { value: 'light', label: '浅色', icon: '☀️' },
  { value: 'dark', label: '深色', icon: '🌙' },
  { value: 'auto', label: '跟随系统', icon: '🖥️' },
]
const BUBBLE_OPTIONS: Array<{
  value: BubbleTheme
  label: string
  out: string
  outInk: string
  inn: string
  bg: string
}> = [
  { value: 'wechat', label: '微信', out: '#07c160', outInk: '#ffffff', inn: '#ffffff', bg: '#f7f7f7' },
  { value: 'whatsapp', label: 'WhatsApp', out: '#d9fdd3', outInk: '#111b21', inn: '#ffffff', bg: '#efeae2' },
  { value: 'imessage', label: 'iMessage', out: '#0b93f6', outInk: '#ffffff', inn: '#e9e9eb', bg: '#ffffff' },
]

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="px-1 pb-1 pt-4 text-[12px] font-medium text-ink-2">{children}</div>
}

function AvatarRow({
  label,
  cfg,
  kind,
  onChange,
}: {
  label: string
  cfg: AvatarCfg
  kind: 'user' | 'term'
  onChange: (a: AvatarCfg) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState('')

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.size > 1024 * 1024) {
      setErr('图片需小于 1MB')
      return
    }
    if (!f.type.startsWith('image/')) {
      setErr('请选择图片文件')
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
            上传图片
          </button>
          <button
            onClick={() => onChange(null)}
            className="rounded-lg px-2.5 py-1 text-[11px] text-ink-2 transition-colors hover:text-ink"
          >
            默认
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
    fontSize,
    setFontSize,
    userAvatar,
    setUserAvatar,
    termAvatar,
    setTermAvatar,
  } = useSettings()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={onClose}
      role="dialog"
      aria-label="设置"
    >
      <div
        className="max-h-[85vh] w-full max-w-[460px] overflow-y-auto rounded-2xl border border-line bg-panel shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-panel px-5 py-3.5">
          <h2 className="text-[16px] font-semibold">设置</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink"
            aria-label="关闭"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="5" y1="5" x2="19" y2="19" />
              <line x1="19" y1="5" x2="5" y2="19" />
            </svg>
          </button>
        </div>

        <div className="px-4 pb-5">
          {/* 主题 */}
          <SectionTitle>主题</SectionTitle>
          <div className="flex gap-2">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                className={
                  'flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-[13px] transition-colors ' +
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

          {/* 气泡配色 */}
          <SectionTitle>气泡配色</SectionTitle>
          <div className="flex gap-2">
            {BUBBLE_OPTIONS.map((opt) => (
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

          {/* 头像 */}
          <SectionTitle>头像</SectionTitle>
          <div className="-mx-1">
            <AvatarRow label="用户" cfg={userAvatar} kind="user" onChange={setUserAvatar} />
            <AvatarRow label="终端" cfg={termAvatar} kind="term" onChange={setTermAvatar} />
          </div>

          {/* 字号 */}
          <SectionTitle>终端字号</SectionTitle>
          <div className="border-t border-line/70 px-1 pt-3">
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-ink-2">A<small>小</small></span>
              <input
                type="range"
                min={11}
                max={22}
                step={0.5}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="accent-brand flex-1"
                aria-label="终端字号"
              />
              <span className="text-[11px] text-ink-2">A大</span>
              <span className="w-12 text-right font-mono-term text-[12px] text-ink-2">{fontSize}px</span>
            </div>
            <div className="mt-2.5 rounded-lg border border-line bg-canvas px-3 py-2.5">
              <div className="font-mono-term term-fs break-all text-ink">
                <span className="text-brand-deep">❯</span> echo hello,终端 · 0123456789
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
