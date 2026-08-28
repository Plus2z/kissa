import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface ContextMenuItem {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  danger?: boolean
  divider?: boolean
}

export interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // 边界约束: 防止右键菜单超出屏幕视口
  useEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const padding = 8
    const left = Math.min(Math.max(padding, x), window.innerWidth - rect.width - padding)
    const top = Math.min(Math.max(padding, y), window.innerHeight - rect.height - padding)
    setPos({ left, top })
  }, [x, y])

  // 点击外部、滚轮或按 Esc 时自动关闭
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    const handleScroll = () => {
      onClose()
    }

    document.addEventListener('mousedown', handleOutsideClick, true)
    document.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleScroll, true)

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick, true)
      document.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleScroll, true)
    }
  }, [onClose])

  const menu = (
    <div
      ref={menuRef}
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-50 min-w-[150px] overflow-hidden rounded-xl border border-line bg-panel/95 p-1 shadow-xl shadow-black/15 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, idx) => (
        <div key={idx}>
          {item.divider && <div className="my-1 border-t border-line/60" />}
          <button
            onClick={() => {
              item.onClick()
              onClose()
            }}
            className={
              'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors ' +
              (item.danger
                ? 'text-danger hover:bg-danger-bg'
                : 'text-ink hover:bg-brand-bg hover:text-brand-deep')
            }
          >
            {item.icon && <span className="shrink-0 text-ink-2">{item.icon}</span>}
            <span className="truncate">{item.label}</span>
          </button>
        </div>
      ))}
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(menu, document.body) : null
}
