import { useEffect, useState } from 'react'
import { useStore } from './store'
import { net, hydrateFromServer } from './net'
import { useSettings, applyTheme, applyFontSize } from './settings'
import { MessageList } from './components/MessageList'
import { InputBar } from './components/InputBar'
import { TerminalPane } from './components/TerminalPane'
import { SettingsModal } from './components/SettingsModal'
import { Avatar } from './components/Avatar'
import { SessionPanel } from './components/SessionPanel'

export default function App() {
  const connStatus = useStore((s) => s.connStatus)
  const cwd = useStore((s) => s.cwd)
  const hostname = useStore((s) => s.hostname)
  const sessionName = useStore((s) => s.sessionName)
  const sshTarget = useStore((s) => s.sshTarget)
  const [showTerminal, setShowTerminal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showSessions, setShowSessions] = useState(false)
  const theme = useSettings((s) => s.theme)
  const bubbleTheme = useSettings((s) => s.bubbleTheme)
  const fontSize = useSettings((s) => s.fontSize)
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

  // 全屏程序:进入自动切到终端视图(程序接管了终端,必须在那里交互),退出自动返回对话
  useEffect(() => {
    setShowTerminal(fullscreen.active)
  }, [fullscreen.active])

  // 程序窗口标题 = 程序名称;终端名(顶栏)= 自定义名 || SSH 目标 || 本机设备名
  useEffect(() => {
    document.title = 'Liminal'
  }, [])
  const termName =
    sessionName ||
    (sshTarget ? (sshTarget.user ? `${sshTarget.user}@${sshTarget.host}` : sshTarget.host) : '') ||
    hostname ||
    'Liminal'

  // 主题应用:'auto' 跟随系统,系统切换时实时响应;气泡配色独立组合
  useEffect(() => {
    const apply = () => applyTheme(theme, bubbleTheme)
    apply()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme, bubbleTheme])

  useEffect(() => {
    applyFontSize(fontSize)
  }, [fontSize])

  const statusColor =
    connStatus === 'ready' ? 'bg-brand' : connStatus === 'connecting' ? 'bg-amber-400' : 'bg-danger'
  const statusText = connStatus === 'ready' ? '已连接' : connStatus === 'connecting' ? '连接中' : '重连中'

  return (
    <div className="flex h-screen flex-col bg-canvas text-ink">
      {/* 顶栏:微信式 56px,头像 + 标题 + 在线绿点,右侧动作区 */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-bar px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar cfg={termAvatar} kind="term" className="h-10 w-10" />
          <h1 className="truncate text-[17px] font-semibold" title={`Liminal · ${termName}`}>
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
              title={`嵌套环境: ${nestedTargetName || 'Shell'} | 模式: ${boundaryMode}`}
            >
              {boundaryMode === 'osc133' ? '🎯 OSC133' : boundaryMode === 'sentinel' ? '⚡ 哨兵' : '🛡️ 兼容'}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="font-mono-term hidden max-w-[280px] truncate text-xs text-ink-2 sm:block" title={cwd}>
            {cwd.replace(/^\/home\/[^/]+/, '~')}
          </span>
          <button
            onClick={() => setShowSessions(true)}
            className="flex h-8 items-center justify-center rounded-lg px-2 text-xs text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink"
            title="会话管理"
          >
            会话
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink"
            title="设置"
            aria-label="设置"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
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
            title="降级路径:任何增强视图出问题时,切到这里就是完整的真实终端"
          >
            {/* 终端小图标 */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
            {showTerminal ? '返回对话' : '终端视图'}
            {fullscreen.active && (
              <span className="ml-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-brand" title="全屏程序运行中" />
            )}
          </button>
        </div>
      </header>

      {showTerminal ? (
        <TerminalPane onClose={() => setShowTerminal(false)} />
      ) : (
        <>
          <MessageList />
          <InputBar />
        </>
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showSessions && <SessionPanel onClose={() => setShowSessions(false)} />}
    </div>
  )
}
