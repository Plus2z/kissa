import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type KeyboardEvent,
  type UIEvent,
} from 'react'
import type { ChatMessage } from '../store'
import { useStore } from '../store'
import { net } from '../net'
import { useSettings } from '../settings'
import { t } from '../i18n'
import { Avatar } from './Avatar'
import { AnsiText } from '../ansi'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'

function stripAnsiText(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '')
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m${Math.floor((ms % 60_000) / 1000)}s`
}

interface MatchItem {
  lineIdx: number
  start: number
  end: number
  id: number
}

/**
 * 分页长文本阅读气泡 (PagerBubble):
 * 专为 man、cat、less、more 等长文本及静态手册呈现设计。
 * 停留在对话视图,不跳出全屏终端,提供上下翻页、全文检索、退出及快捷键联动。
 */
export function PagerBubble({ msg }: { msg: ChatMessage }) {
  const termAvatar = useSettings((s) => s.termAvatar)
  const language = useSettings((s) => s.language)
  const togglePager = useStore((s) => s.togglePager)
  const cmdMsg = useStore((s) =>
    s.messages.find((m) => m.kind === 'command' && m.id === `cmd-${msg.commandId}`),
  )

  const tr = t(language)
  const isRunning = msg.status === 'running'
  const isFailed = msg.status === 'failed'

  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeMatchIdx, setActiveMatchIdx] = useState(0)

  // 滚动与页码计算
  const [pageInfo, setPageInfo] = useState({ current: 1, total: 1, startLine: 1, endLine: 1 })
  const containerRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // 处理文本行
  const rawContent = msg.content ?? ''
  const lines = useMemo(() => {
    return rawContent.replace(/\n+$/, '').split('\n')
  }, [rawContent])

  const cleanLines = useMemo(() => {
    return lines.map((l) => stripAnsiText(l))
  }, [lines])

  // 计算全局搜索匹配项
  const matches: MatchItem[] = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    const res: MatchItem[] = []
    let id = 0
    cleanLines.forEach((clean, lineIdx) => {
      const lower = clean.toLowerCase()
      let pos = 0
      while (pos < lower.length) {
        const found = lower.indexOf(q, pos)
        if (found === -1) break
        res.push({
          lineIdx,
          start: found,
          end: found + q.length,
          id: id++,
        })
        pos = found + Math.max(1, q.length)
      }
    })
    return res
  }, [cleanLines, searchQuery])

  // 当搜索词变更时，重置当前高亮为第 1 处匹配
  useEffect(() => {
    setActiveMatchIdx(0)
  }, [searchQuery])

  // 滚动到当前匹配项所在的行
  const scrollToMatch = useCallback(
    (idx: number) => {
      if (matches.length === 0 || idx < 0 || idx >= matches.length) return
      const targetMatch = matches[idx]
      if (!targetMatch) return

      const el = viewportRef.current
      if (!el) return

      const lineEl = el.querySelector<HTMLElement>(`[data-line="${targetMatch.lineIdx}"]`)
      if (lineEl) {
        lineEl.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    },
    [matches],
  )

  useEffect(() => {
    if (matches.length > 0) {
      scrollToMatch(activeMatchIdx)
    }
  }, [activeMatchIdx, matches.length, scrollToMatch])

  // 视口滚动事件: 动态计算当前可见页数与行数范围
  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const { scrollTop, scrollHeight, clientHeight } = el
    const totalLines = lines.length
    if (totalLines === 0 || clientHeight === 0) return

    const totalPages = Math.max(1, Math.ceil(scrollHeight / clientHeight))
    const current = Math.min(totalPages, Math.max(1, Math.round(scrollTop / clientHeight) + 1))

    const ratioStart = scrollHeight > 0 ? scrollTop / scrollHeight : 0
    const ratioEnd = scrollHeight > 0 ? (scrollTop + clientHeight) / scrollHeight : 1

    const startLine = Math.min(totalLines, Math.max(1, Math.floor(ratioStart * totalLines) + 1))
    const endLine = Math.min(totalLines, Math.max(startLine, Math.ceil(ratioEnd * totalLines)))

    setPageInfo({ current, total: totalPages, startLine, endLine })
  }

  // 初始与内容变更时刷新分页指示
  useEffect(() => {
    const el = viewportRef.current
    if (el) {
      handleScroll({ currentTarget: el } as UIEvent<HTMLDivElement>)
    }
  }, [lines.length])

  // 操作: 上一页
  const handlePageUp = () => {
    if (isRunning) {
      net.send({ type: 'stdin', data: 'b' })
    }
    const el = viewportRef.current
    if (el) {
      el.scrollBy({ top: -el.clientHeight * 0.85, behavior: 'smooth' })
    }
  }

  // 操作: 下一页
  const handlePageDown = () => {
    if (isRunning) {
      net.send({ type: 'stdin', data: ' ' })
    }
    const el = viewportRef.current
    if (el) {
      el.scrollBy({ top: el.clientHeight * 0.85, behavior: 'smooth' })
    }
  }

  // 操作: 退出
  const handleExit = () => {
    if (isRunning) {
      // 运行中给 PTY 发送 q
      net.send({ type: 'stdin', data: 'q' })
    }
    // 关闭或切换回普通视图
    togglePager(msg.id)
  }

  // 监听全局与底部控制条派发的 Pager 动作事件
  useEffect(() => {
    const handlePagerAction = (e: Event) => {
      const custom = e as CustomEvent<{ action: 'up' | 'down' | 'search' | 'exit' }>
      if (!custom.detail?.action) return
      switch (custom.detail.action) {
        case 'up':
          handlePageUp()
          break
        case 'down':
          handlePageDown()
          break
        case 'search':
          setShowSearch((v) => {
            const next = !v
            if (next) {
              requestAnimationFrame(() => searchInputRef.current?.focus())
            }
            return next
          })
          break
        case 'exit':
          handleExit()
          break
      }
    }
    window.addEventListener('kissa:pager-action', handlePagerAction)
    return () => window.removeEventListener('kissa:pager-action', handlePagerAction)
  }, [isRunning, msg.id])

  // 挂载时自动退出输入状态，让 PagerBubble 获得焦点以直接响应快捷键
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('kissa:blur-input'))
    const t = setTimeout(() => {
      containerRef.current?.focus({ preventScroll: true })
    }, 40)
    return () => clearTimeout(t)
  }, [])

  // 监听焦点返回卡片事件 (如按下 Ctrl+Tab)
  useEffect(() => {
    const handleFocusPager = () => {
      containerRef.current?.focus({ preventScroll: true })
    }
    window.addEventListener('kissa:focus-pager', handleFocusPager)
    return () => window.removeEventListener('kissa:focus-pager', handleFocusPager)
  }, [])

  // 快捷键监听 (原生终端 Pager 键)
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // 处于搜索输入框时忽略常规快捷键
    if (document.activeElement === searchInputRef.current) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowSearch(false)
        containerRef.current?.focus()
      }
      return
    }

    // Tab (Tap): 从分页卡片快速切入底部输入框
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent('kissa:focus-input'))
      return
    }

    // Ctrl+Tab (Ctrl+Tap): 维持在卡片焦点
    if (e.key === 'Tab' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      containerRef.current?.focus({ preventScroll: true })
      return
    }

    // 原生 Pager 翻页 (上一页: b / PageUp / ↑)
    if (e.key === 'b' || e.key === 'PageUp' || e.key === 'ArrowUp') {
      e.preventDefault()
      handlePageUp()
      return
    }

    // 原生 Pager 翻页 (下一页: 空格 / PageDown / f / ↓)
    if (e.key === ' ' || e.key === 'PageDown' || e.key === 'f' || e.key === 'ArrowDown') {
      e.preventDefault()
      handlePageDown()
      return
    }

    // 原生 Pager 检索: /
    if (e.key === '/') {
      e.preventDefault()
      setShowSearch(true)
      requestAnimationFrame(() => searchInputRef.current?.focus())
      return
    }

    // 原生 Pager 退出: q / Escape
    if (e.key === 'q' || e.key === 'Escape') {
      e.preventDefault()
      handleExit()
      return
    }
  }

  // 搜索导航
  const handleNextMatch = () => {
    if (matches.length === 0) return
    setActiveMatchIdx((prev) => (prev + 1) % matches.length)
  }

  const handlePrevMatch = () => {
    if (matches.length === 0) return
    setActiveMatchIdx((prev) => (prev - 1 + matches.length) % matches.length)
  }

  const copy = async () => {
    await navigator.clipboard.writeText(cleanLines.join('\n'))
  }

  const menuItems: ContextMenuItem[] = [
    {
      label: tr.copyOutput,
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      ),
      onClick: () => void copy(),
    },
    {
      label: tr.viewRaw,
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="4 7 4 4 20 4 20 7" />
          <line x1="9" y1="20" x2="15" y2="20" />
          <line x1="12" y1="4" x2="12" y2="20" />
        </svg>
      ),
      onClick: () => togglePager(msg.id),
    },
  ]

  if (isRunning) {
    menuItems.push({
      label: tr.interruptCommand,
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
          <rect x="5" y="5" width="14" height="14" rx="2" />
        </svg>
      ),
      danger: true,
      divider: true,
      onClick: () => net.send({ type: 'stdin', data: '\x03' }),
    })
  }

  const displayTitle = cmdMsg?.text?.trim() || msg.program || 'Pager'

  return (
    <div className="flex items-start gap-2.5 px-4 py-2">
      <Avatar cfg={termAvatar} kind="term" />
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setMenuPos({ x: e.clientX, y: e.clientY })
        }}
        className={
          'flex flex-col w-full max-w-[min(1080px,calc(100vw-4.5rem))] h-[min(650px,68vh)] min-h-[380px] rounded-2xl rounded-bl-sm border bg-bubble-in shadow-md overflow-hidden transition-all outline-none focus:ring-1 focus:ring-brand/40 ' +
          (isFailed ? 'border-danger/40' : 'border-line/70')
        }
      >
        {/* 顶栏工具条: 标题 + 运行状态 + 页码指示 + 控件按钮 */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 bg-panel/50 px-3.5 py-2 select-none">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm">📖</span>
            <span className="font-mono-term text-[12px] font-semibold text-ink truncate max-w-[280px] sm:max-w-md" title={displayTitle}>
              {displayTitle}
            </span>
            {isRunning ? (
              <span className="flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand-deep">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
                {tr.running}
              </span>
            ) : isFailed ? (
              <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-medium text-danger">
                {tr.failedExit(msg.exitCode ?? '?')}
              </span>
            ) : (
              <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[11px] text-ink-2">
                {tr.completed}
              </span>
            )}
            {msg.durationMs !== undefined && (
              <span className="text-[10px] text-ink-2 hidden sm:inline">{fmtDuration(msg.durationMs)}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* 页码与行数指示 */}
            <span className="font-mono-term text-[11px] text-ink-2">
              {tr.pageIndicator(pageInfo.current, pageInfo.total)}
              <span className="hidden md:inline ml-1.5 text-ink-2/70">
                ({tr.lineIndicator(pageInfo.startLine, pageInfo.endLine, lines.length)})
              </span>
            </span>
            <button
              onClick={() => togglePager(msg.id)}
              className="text-[11px] text-brand-deep hover:underline ml-1"
              title={tr.viewRaw}
            >
              {tr.viewRaw}
            </button>
          </div>
        </div>

        {/* 内嵌全文搜索条 */}
        {showSearch && (
          <div className="flex items-center gap-2 border-b border-line/60 bg-bar/80 px-3.5 py-1.5">
            <div className="relative flex min-w-0 flex-1 items-center">
              <span className="absolute left-2 text-ink-2">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (e.shiftKey) handlePrevMatch()
                    else handleNextMatch()
                  }
                }}
                placeholder={tr.searchInText}
                className="font-mono-term term-fs w-full rounded-md border border-line bg-surface py-1 pl-7 pr-3 text-ink outline-none focus:border-brand"
              />
            </div>

            <span className="font-mono-term text-[11px] text-ink-2 whitespace-nowrap min-w-[70px] text-center">
              {searchQuery.trim() === ''
                ? ''
                : matches.length > 0
                ? tr.matchIndicator(activeMatchIdx + 1, matches.length)
                : tr.noMatches}
            </span>

            <button
              onClick={handlePrevMatch}
              disabled={matches.length === 0}
              className="rounded p-1 text-ink-2 hover:bg-ink/5 disabled:opacity-30"
              title="上一个 (Shift+Enter)"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </button>

            <button
              onClick={handleNextMatch}
              disabled={matches.length === 0}
              className="rounded p-1 text-ink-2 hover:bg-ink/5 disabled:opacity-30"
              title="下一个 (Enter)"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            <button
              onClick={() => {
                setShowSearch(false)
                setSearchQuery('')
              }}
              className="rounded p-1 text-ink-2 hover:bg-ink/5"
              title="关闭 (Esc)"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {/* 文本阅读视口 */}
        <div
          ref={viewportRef}
          onScroll={handleScroll}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-3 font-mono-term term-fs text-bubble-in-ink leading-[1.55] select-text scroll-smooth"
        >
          {lines.map((line, idx) => {
            const clean = cleanLines[idx] ?? ''
            const q = searchQuery.trim().toLowerCase()

            // 判断是否有高亮
            if (q && clean.toLowerCase().includes(q)) {
              // 拆分关键词渲染高亮
              const lower = clean.toLowerCase()
              const parts: { text: string; isMatch: boolean; isCurrent: boolean }[] = []
              let last = 0
              let pos = 0
              while (pos < lower.length) {
                const found = lower.indexOf(q, pos)
                if (found === -1) break
                if (found > last) {
                  parts.push({ text: clean.slice(last, found), isMatch: false, isCurrent: false })
                }
                const matchObj = matches.find((m) => m.lineIdx === idx && m.start === found)
                const isCurrent = matchObj ? matchObj.id === matches[activeMatchIdx]?.id : false
                parts.push({ text: clean.slice(found, found + q.length), isMatch: true, isCurrent })
                last = found + q.length
                pos = last
              }
              if (last < clean.length) {
                parts.push({ text: clean.slice(last), isMatch: false, isCurrent: false })
              }

              return (
                <div key={idx} data-line={idx} className="whitespace-pre-wrap hover:bg-ink/5 rounded-xs">
                  {parts.map((p, pIdx) =>
                    p.isMatch ? (
                      <mark
                        key={pIdx}
                        className={
                          p.isCurrent
                            ? 'bg-brand text-white font-bold rounded-xs px-0.5 shadow-xs ring-1 ring-brand-deep'
                            : 'bg-yellow-300 dark:bg-yellow-500/40 text-ink rounded-xs px-0.5'
                        }
                      >
                        {p.text}
                      </mark>
                    ) : (
                      <span key={pIdx}>{p.text}</span>
                    ),
                  )}
                </div>
              )
            }

            return (
              <div key={idx} data-line={idx} className="whitespace-pre-wrap hover:bg-ink/5 rounded-xs">
                <AnsiText text={line} />
              </div>
            )
          })}
        </div>

        {/* 底部按键控制条: 上下页 + 搜索 + 退出, 原生终端快捷键提示 */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 bg-panel/60 px-3.5 py-2 select-none">
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* 上一页按钮 */}
            <button
              type="button"
              onClick={handlePageUp}
              className="flex items-center gap-1 rounded-md border border-line bg-bubble-in px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-ink/5 active:scale-95 transition-all shadow-xs"
              title={`${tr.pageUp} (b / PageUp)`}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="18 15 12 9 6 15" />
              </svg>
              <span>{tr.pageUp}</span>
              <kbd className="ml-1 rounded bg-ink/10 px-1.5 py-0.2 text-[9px] font-mono text-ink-2">b</kbd>
            </button>

            {/* 下一页按钮 */}
            <button
              type="button"
              onClick={handlePageDown}
              className="flex items-center gap-1 rounded-md border border-line bg-bubble-in px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-ink/5 active:scale-95 transition-all shadow-xs"
              title={`${tr.pageDown} (空格 / PageDown)`}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9" />
              </svg>
              <span>{tr.pageDown}</span>
              <kbd className="ml-1 rounded bg-ink/10 px-1.5 py-0.2 text-[9px] font-mono text-ink-2">空格</kbd>
            </button>

            {/* 搜索按钮 */}
            <button
              type="button"
              onClick={() => {
                setShowSearch((v) => !v)
                if (!showSearch) {
                  requestAnimationFrame(() => searchInputRef.current?.focus())
                }
              }}
              className={
                'flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-all shadow-xs ' +
                (showSearch
                  ? 'border-brand bg-brand-bg text-brand-deep font-medium'
                  : 'border-line bg-bubble-in text-ink hover:bg-ink/5')
              }
              title={`${tr.pagerSearch} (/)`}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span>{tr.pagerSearch}</span>
              <kbd className="ml-1 rounded bg-ink/10 px-1.5 py-0.2 text-[9px] font-mono text-ink-2">/</kbd>
            </button>

            {/* 退出按钮 */}
            <button
              type="button"
              onClick={handleExit}
              className="flex items-center gap-1 rounded-md border border-danger/30 bg-danger/10 px-2.5 py-1 text-[11px] font-medium text-danger hover:bg-danger/20 active:scale-95 transition-all shadow-xs"
              title={`${tr.pagerExit} (q / Esc)`}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              <span>{tr.pagerExit}</span>
              <kbd className="ml-1 rounded bg-danger/15 px-1.5 py-0.2 text-[9px] font-mono text-danger">q</kbd>
            </button>
          </div>

          <div className="text-[10px] text-ink-2/70 hidden md:inline">
            快捷键: 空格/b 翻页 · / 搜索 · q 退出 · Tab 输入 · Ctrl+Tab 退出输入
          </div>
        </div>
      </div>

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
