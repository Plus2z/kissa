import { useState } from 'react'
import type { ChatMessage } from '../store'
import { useSettings } from '../settings'
import { t } from '../i18n'
import { Avatar } from './Avatar'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'

function fmtTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 命令气泡 = 微信"发送方"样式:绿底、右对齐、右下小尾巴、用户头像、支持右键菜单 */
export function CommandBubble({ msg }: { msg: ChatMessage }) {
  const cwdShort = (msg.cwd ?? '').replace(/^\/home\/[^/]+/, '~')
  const userAvatar = useSettings((s) => s.userAvatar)
  const language = useSettings((s) => s.language)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const tr = t(language)

  const copyCommand = async () => {
    if (!msg.text) return
    await navigator.clipboard.writeText(msg.text)
  }

  const fillCommand = () => {
    if (!msg.text) return
    window.dispatchEvent(new CustomEvent('kissa:fill-input', { detail: { text: msg.text } }))
  }

  const menuItems: ContextMenuItem[] = [
    {
      label: tr.copyCommand,
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      ),
      onClick: () => void copyCommand(),
    },
    {
      label: tr.refillCommand,
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      ),
      onClick: fillCommand,
    },
  ]

  return (
    <div className="flex items-end justify-end gap-2.5 px-4 py-1.5">
      <div className="w-fit max-w-[75%]">
        <div
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setMenuPos({ x: e.clientX, y: e.clientY })
          }}
          className="inline-block max-w-full cursor-context-menu rounded-2xl rounded-br-sm bg-bubble-out px-4 py-2.5 shadow-sm transition-opacity hover:opacity-95"
        >
          <div className="font-mono-term term-fs text-bubble-out-ink break-all leading-relaxed">
            <span className="mr-1.5 opacity-70">❯</span>
            {msg.text}
          </div>
        </div>
        <div className="mt-1 flex items-center justify-end gap-2 pr-1 text-[11px] text-ink-2">
          {cwdShort && <span className="font-mono-term">{cwdShort}</span>}
          <span>{fmtTime(msg.ts)}</span>
        </div>
      </div>
      <Avatar cfg={userAvatar} kind="user" />

      {menuPos && (
        <ContextMenu
          x={menuPos.x}
          y={menuPos.y}
          items={menuItems}
          onClose={() => setMenuPos(null)}
        />
      )}
    </div>
  )
}
