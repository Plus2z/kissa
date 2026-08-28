import { useEffect, useState } from 'react'
import {
  closeSession,
  createSession,
  currentSessionId,
  listSessions,
  renameSession,
  switchSession,
  type SessionInfo,
} from '../net'
import { useSettings } from '../settings'
import { t, type Language } from '../i18n'
import { SshDialog } from './SshDialog'

/** 会话显示名:自定义名 > SSH 目标 > cwd 标签 */
function displayName(session: SessionInfo, lang: Language): string {
  if (session.name) return session.name
  if (session.sshTarget) {
    const { user, host } = session.sshTarget
    return user ? `${user}@${host}` : host
  }
  const cwd = session.cwd.replace(/^\/home\/[^/]+/, '~')
  const tr = t(lang)
  return cwd === '~' ? tr.defaultSessionName : cwd
}

/** 内联重命名:Enter 保存,Esc/取消 关闭 */
function RenameInline({
  session,
  lang,
  onDone,
}: {
  session: SessionInfo
  lang: Language
  onDone: () => void
}) {
  const [value, setValue] = useState(session.name)
  const tr = t(lang)
  const commit = () => {
    renameSession(session.id, value.trim())
    onDone()
  }
  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') onDone()
        }}
        spellCheck={false}
        placeholder={tr.renamePlaceholder}
        className="font-mono-term term-fs min-w-0 flex-1 rounded-md border border-line bg-canvas px-2 py-1 text-[12px] text-ink outline-none focus:border-brand"
      />
      <button onClick={commit} className="text-[11px] text-brand-deep hover:underline">
        {tr.save}
      </button>
      <button onClick={onDone} className="text-[11px] text-ink-2 hover:underline">
        {tr.cancel}
      </button>
    </div>
  )
}

export function SessionPanel({ onClose }: { onClose: () => void }) {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [showSsh, setShowSsh] = useState(false)
  const activeId = currentSessionId()

  const language = useSettings((s) => s.language)
  const tr = t(language)

  const refresh = async () => {
    try {
      setError('')
      setSessions(await listSessions())
    } catch (err) {
      setError(err instanceof Error ? err.message : tr.loadSessionFailed)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const onNew = async () => {
    setBusy(true)
    try {
      const session = await createSession()
      switchSession(session.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : tr.createSessionFailed)
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async (session: SessionInfo) => {
    setBusy(true)
    try {
      await closeSession(session.id)
      if (session.id === activeId) switchSession(null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : tr.closeSessionFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/20" onMouseDown={onClose} role="dialog" aria-label={tr.sessionTitle}>
      <aside
        className="h-full w-[min(340px,88vw)] border-r border-line bg-panel p-4 shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-semibold">{tr.sessionTitle}</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-[12px] text-ink-2 hover:bg-ink/5 hover:text-ink">
            {tr.close}
          </button>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => void onNew()}
            disabled={busy}
            className="flex-1 rounded-xl bg-brand px-3 py-2 text-[13px] font-medium text-white disabled:opacity-50"
          >
            {tr.newSession}
          </button>
          <button
            onClick={() => setShowSsh(true)}
            disabled={busy}
            className="flex-1 rounded-xl border border-line bg-canvas px-3 py-2 text-[13px] text-ink hover:bg-ink/5 disabled:opacity-50"
          >
            {tr.sshConnect}
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={
                'rounded-xl border px-3 py-2.5 ' +
                (session.id === activeId ? 'border-brand bg-brand-bg' : 'border-line bg-canvas')
              }
            >
              <button
                onClick={() => {
                  if (session.id !== activeId) switchSession(session.id)
                  onClose()
                }}
                className="block w-full text-left"
              >
                <div className="flex items-center justify-between gap-1">
                  <div className="truncate text-[13px] font-medium">{displayName(session, language)}</div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setRenamingId(renamingId === session.id ? null : session.id)
                    }}
                    className="shrink-0 text-[10px] text-ink-2 hover:text-ink"
                    title={tr.renameTerminal}
                  >
                    ✎
                  </button>
                </div>
                <div className="mt-1 text-[11px] text-ink-2">
                  {session.connected ? tr.sessionConnected : tr.sessionBgAlive} · {session.sandboxMode === 'bwrap' ? tr.modeSandbox : tr.modeHost}
                  {session.sshTarget && <span className="text-brand-deep"> · SSH</span>}
                </div>
              </button>
              {renamingId === session.id && (
                <RenameInline session={session} lang={language} onDone={() => setRenamingId(null)} />
              )}
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10px] text-ink-2">{new Date(session.lastActiveAt).toLocaleTimeString()}</span>
                <button
                  onClick={() => void onDelete(session)}
                  disabled={busy}
                  className="text-[11px] text-danger hover:underline disabled:opacity-50"
                >
                  {tr.deleteSession}
                </button>
              </div>
            </div>
          ))}
          {!sessions.length && !error && <div className="py-8 text-center text-[12px] text-ink-2">...</div>}
        </div>
        {error && <div className="mt-3 text-[12px] text-danger">{error}</div>}
      </aside>
      {showSsh && <SshDialog onClose={() => setShowSsh(false)} />}
    </div>
  )
}
