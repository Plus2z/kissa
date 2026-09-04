import { useEffect, useRef, useState } from 'react'
import { useStore } from './store'
import { net, hydrateFromServer } from './net'
import {
  useSettings,
  applyTheme,
  applyFontSize,
  applyFontFamily,
  applyColorScheme,
} from './settings'
import { t } from './i18n'
import { MessageList, type MessageListHandle } from './components/MessageList'
import { InputBar } from './components/InputBar'
import { TerminalPane } from './components/TerminalPane'
import { SettingsModal } from './components/SettingsModal'
import { Avatar } from './components/Avatar'
import { SessionPanel } from './components/SessionPanel'
import { SearchOverlay } from './components/SearchOverlay'
import { formatSessionAsMarkdown, downloadMarkdown } from './exportUtils'

export default function App() {
  const connStatus = useStore((s) => s.connStatus)
  const cwd = useStore((s) => s.cwd)
  const hostname = useStore((s) => s.hostname)
  const sessionName = useStore((s) => s.sessionName)
  const sshTarget = useStore((s) => s.sshTarget)
  const messages = useStore((s) => s.messages)
  const [showTerminal, setShowTerminal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showSessions, setShowSessions] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const messageListRef = useRef<MessageListHandle>(null)

  const theme = useSettings((s) => s.theme)
  const bubbleTheme = useSettings((s) => s.bubbleTheme)
  const colorScheme = useSettings((s) => s.colorScheme)
  const fontSize = useSettings((s) => s.fontSize)
  const fontFamily = useSettings((s) => s.fontFamily)
  const termAvatar = useSettings((s) => s.termAvatar)
  const fullscreen = useStore((s) => s.fullscreen)
  const boundaryMode = useStore((s) => s.boundaryMode)
  const boundaryDepth = useStore((s) => s.boundaryDepth)
  const nestedTargetName = useStore((s) => s.nestedTargetName)

  useEffect(() => {
    net.connect()
    void hydrateFromServer()
    return () => net.dispose()
  }, [])

  // 全屏程序:仅真正的全屏 TUI 程序 (vim/htop/tmux 等) 自动切到终端视图;
  // 分页长文本程序 (man/less/cat 等) 停留在对话视图以气泡呈现
  useEffect(() => {
    if (fullscreen.active && fullscreen.mode !== 'pager') {
      setShowTerminal(true)
    } else if (!fullscreen.active) {
      setShowTerminal(false)
    }
  }, [fullscreen.active, fullscreen.mode])

  // 程序窗口标题 = 程序名称;终端名(顶栏)= 自定义名 || SSH 目标 || 本机设备名
  useEffect(() => {
    document.title = 'Kissa'
  }, [])
  const termName =
    sessionName ||
    (sshTarget ? (sshTarget.user ? `${sshTarget.user}@${sshTarget.host}` : sshTarget.host) : '') ||
    hostname ||
    'Kissa'

  // 主题应用:'auto' 跟随系统,系统切换时实时响应;气泡配色独立组合
  useEffect(() => {
    const apply = () => {
      applyTheme(theme, bubbleTheme)
      applyColorScheme(colorScheme, theme)
    }
    apply()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme, bubbleTheme, colorScheme])

  useEffect(() => {
    applyFontSize(fontSize)
  }, [fontSize])

  useEffect(() => {
    applyFontFamily(fontFamily)
  }, [fontFamily])

  const handleExport = () => {
    const md = formatSessionAsMarkdown(messages, {
      sessionName,
      hostname,
      targetName:
        nestedTargetName ||
        (sshTarget ? `${sshTarget.user ? sshTarget.user + '@' : ''}${sshTarget.host}` : undefined),
    })
    const dateStr = new Date().toISOString().slice(0, 10)
    const safeName = (sessionName || hostname || 'session').replace(
      /[^a-zA-Z0-9_\u4e00-\u9fa5-]/g,
      '_',
    )
    downloadMarkdown(md, `kissa-${safeName}-${dateStr}.md`)
  }

  // 窗口切回 / 应用唤醒自动聚焦输入框
  useEffect(() => {
    const focusInput = () => {
      if (!showTerminal && !showSettings && !showSessions) {
        window.dispatchEvent(new CustomEvent('kissa:focus-input'))
      }
    }
    window.addEventListener('focus', focusInput)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        focusInput()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', focusInput)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [showTerminal, showSettings, showSessions])

  // 全局快捷键与事件监听
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // 光标不在输入框时按 Tab (Tap): 直接进入输入模式
      if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !showTerminal && !showSettings && !showSessions && !showSearch) {
        const active = document.activeElement as HTMLElement | null
        const isInput = active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA'
        if (!isInput) {
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('kissa:focus-input'))
          return
        }
      }

      // 按 Ctrl+Tab (Ctrl+Tap): 退出输入状态，焦点返回分页卡片
      if (e.key === 'Tab' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('kissa:blur-input'))
        window.dispatchEvent(new CustomEvent('kissa:focus-pager'))
        return
      }

      // Pager 专属快捷键 (Ctrl+组合键): 运行中或存在分页卡片时生效
      const hasPager =
        (fullscreen.active && fullscreen.mode === 'pager') ||
        useStore.getState().messages.some((m) => m.isPager)
      if (hasPager && (e.ctrlKey || e.metaKey)) {
        if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'u') {
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('kissa:pager-action', { detail: { action: 'up' } }))
          return
        }
        if (e.key === 'ArrowDown' || e.key.toLowerCase() === 'd') {
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('kissa:pager-action', { detail: { action: 'down' } }))
          return
        }
        if (e.key.toLowerCase() === 'k' || e.key === '/') {
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('kissa:pager-action', { detail: { action: 'search' } }))
          return
        }
        if (e.key.toLowerCase() === 'e') {
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('kissa:pager-action', { detail: { action: 'exit' } }))
          return
        }
      }

      // Ctrl+F / Cmd+F: 触发搜索
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !showTerminal) {
        e.preventDefault()
        setShowSearch((v) => !v)
        return
      }
      // Ctrl+L: 清空聊天流
      if (e.ctrlKey && e.key.toLowerCase() === 'l' && !showTerminal) {
        e.preventDefault()
        useStore.setState({
          messages: [
            {
              id: `sys-clear-${Date.now()}`,
              kind: 'system',
              ts: Date.now(),
              text: '✨ 聊天界面已清空 (Ctrl+L)',
            },
          ],
        })
        return
      }
      // Ctrl+` (反引号): 切换终端视图
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault()
        setShowTerminal((v) => !v)
      }
    }

    const onExportEv = () => handleExport()
    const onOpenSshEv = () => setShowSessions(true)

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('kissa:export', onExportEv)
    window.addEventListener('kissa:open-ssh', onOpenSshEv)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('kissa:export', onExportEv)
      window.removeEventListener('kissa:open-ssh', onOpenSshEv)
    }
  }, [showTerminal, showSettings, showSessions, showSearch, messages, sessionName, hostname, nestedTargetName, sshTarget])

  const language = useSettings((s) => s.language)
  const tr = t(language)

  const statusColor =
    connStatus === 'ready' ? 'bg-brand' : connStatus === 'connecting' ? 'bg-amber-400' : 'bg-danger'
  const statusText =
    connStatus === 'ready'
      ? tr.statusConnected
      : connStatus === 'connecting'
      ? tr.statusConnecting
      : tr.statusReconnecting

  return (
    <div className="flex h-screen flex-col bg-canvas text-ink">
      {/* 顶栏:微信式 56px,头像 + 标题 + 在线绿点,右侧动作区 */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-bar px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar cfg={termAvatar} kind="term" className="h-10 w-10" />
          <h1 className="truncate text-[17px] font-semibold" title={`Kissa · ${termName}`}>
            {termName}
          </h1>
          <span className={`h-2 w-2 shrink-0 rounded-full ${statusColor}`} title={statusText} />
          {boundaryDepth > 0 && (
            <span
              className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                boundaryMode === 'osc133'
                  ? 'bg-brand-bg text-brand-deep'
                  : boundaryMode === 'sentinel'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                  : 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300'
              }`}
              title={`${tr.nestedShell}: ${nestedTargetName || 'Shell'} | 模式: ${boundaryMode}`}
            >
              {boundaryMode === 'osc133' ? '🎯 OSC133' : boundaryMode === 'sentinel' ? '⚡ Sentinel' : '🛡️ Raw'}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <span className="font-mono-term hidden max-w-[240px] truncate text-xs text-ink-2 md:block" title={cwd}>
            {cwd.replace(/^\/home\/[^/]+/, '~')}
          </span>

          {/* 搜索按钮 */}
          {!showTerminal && (
            <button
              onClick={() => setShowSearch((v) => !v)}
              className={
                'flex h-8 w-8 items-center justify-center rounded-full transition-colors ' +
                (showSearch ? 'bg-brand-bg text-brand-deep' : 'text-ink-2 hover:bg-ink/5 hover:text-ink')
              }
              title={tr.search}
              aria-label={tr.search}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          )}

          {/* 导出按钮 */}
          <button
            onClick={handleExport}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink"
            title={tr.exportMarkdown}
            aria-label={tr.exportMarkdown}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>

          <button
            onClick={() => setShowSessions(true)}
            className="flex h-8 items-center justify-center rounded-lg px-2 text-xs text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink"
            title={tr.sessions}
          >
            {tr.sessions}
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink"
            title={tr.settings}
            aria-label={tr.settings}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0-.33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <button
            onClick={() => setShowTerminal((v) => !v)}
            className={
              'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors ' +
              (showTerminal
                ? 'bg-brand-bg text-brand-deep'
                : 'text-ink-2 hover:bg-ink/5 hover:text-ink')
            }
            title={showTerminal ? tr.returnToChat : `${tr.terminalView} (Ctrl+\`)`}
          >
            {/* 终端小图标 */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
            {showTerminal ? tr.returnToChat : tr.terminalView}
            {fullscreen.active && fullscreen.mode !== 'pager' && (
              <span className="ml-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-brand" title={tr.fullscreenActive} />
            )}
          </button>
        </div>
      </header>

      {showSearch && (
        <SearchOverlay
          messages={messages}
          onClose={() => setShowSearch(false)}
          onNavigate={(idx) => messageListRef.current?.scrollToIndex(idx)}
        />
      )}

      {showTerminal ? (
        <TerminalPane onClose={() => setShowTerminal(false)} />
      ) : (
        <>
          <MessageList ref={messageListRef} />
          <InputBar />
        </>
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showSessions && <SessionPanel onClose={() => setShowSessions(false)} />}
    </div>
  )
}
