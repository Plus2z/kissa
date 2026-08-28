import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { ChatMessage } from '../store'
import { useSettings } from '../settings'
import { t } from '../i18n'

interface SearchOverlayProps {
  messages: ChatMessage[]
  onClose: () => void
  onNavigate: (index: number) => void
}

export function SearchOverlay({ messages, onClose, onNavigate }: SearchOverlayProps) {
  const [query, setQuery] = useState('')
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const language = useSettings((s) => s.language)
  const tr = t(language)

  // 检索匹配的消息索引
  const matches = query.trim()
    ? messages
        .map((m, idx) => {
          const q = query.toLowerCase()
          if (m.kind === 'command' && m.text?.toLowerCase().includes(q)) return idx
          if (m.kind === 'output' && m.content?.toLowerCase().includes(q)) return idx
          if (m.kind === 'system' && m.text?.toLowerCase().includes(q)) return idx
          return -1
        })
        .filter((idx) => idx !== -1)
    : []

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (matches.length > 0) {
      setCurrentMatchIdx(0)
      onNavigate(matches[0]!)
    }
  }, [query])

  const goToNext = () => {
    if (matches.length === 0) return
    const next = (currentMatchIdx + 1) % matches.length
    setCurrentMatchIdx(next)
    onNavigate(matches[next]!)
  }

  const goToPrev = () => {
    if (matches.length === 0) return
    const prev = (currentMatchIdx - 1 + matches.length) % matches.length
    setCurrentMatchIdx(prev)
    onNavigate(matches[prev]!)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) {
        goToPrev()
      } else {
        goToNext()
      }
    }
  }

  return (
    <div className="absolute right-4 top-16 z-30 flex items-center gap-1.5 rounded-xl border border-line bg-panel/95 p-1.5 shadow-lg backdrop-blur-md">
      <div className="flex items-center gap-1.5 px-2">
        <svg
          className="h-3.5 w-3.5 text-ink-2"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
          />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={tr.searchPlaceholder}
          className="w-44 bg-transparent text-xs text-ink outline-none placeholder:text-ink-2/60"
        />
      </div>

      <span className="text-[11px] text-ink-2">
        {query.trim() === '' ? '' : matches.length > 0 ? `${currentMatchIdx + 1}/${matches.length}` : tr.noResults}
      </span>

      <div className="flex items-center gap-0.5 border-l border-line/60 pl-1">
        <button
          onClick={goToPrev}
          disabled={matches.length === 0}
          className="flex h-6 w-6 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-30"
          title={tr.prevMatch}
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
          </svg>
        </button>
        <button
          onClick={goToNext}
          disabled={matches.length === 0}
          className="flex h-6 w-6 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-30"
          title={tr.nextMatch}
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink"
          title={tr.closeSearch}
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
