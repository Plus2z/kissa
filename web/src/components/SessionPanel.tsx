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
import { SshDialog } from './SshDialog'

/** 会话显示名:自定义名 > SSH 目标 > cwd 标签 */
function displayName(session: SessionInfo): string {
  if (session.name) return session.name
  if (session.sshTarget) {
    const { user, host } = session.sshTarget
    return user ? `${user}@${host}` : host
  }
  const cwd = session.cwd.replace(/^\/home\/[^/]+/, '~')
  return cwd === '~' ? '终端会话' : cwd
}

/** 内联重命名:Enter 保存,Esc/取消 关闭 */
function RenameInline({ session, onDone }: { session: SessionInfo; onDone: () => void }) {
  const [value, setValue] = useState(session.name)
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
        placeholder="终端名(留空恢复默认)"
        className="font-mono-term term-fs min-w-0 flex-1 rounded-md border border-line bg-canvas px-2 py-1 text-[12px] text-ink outline-none focus:border-brand"
      />
      <button onClick={commit} className="text-[11px] text-brand-deep hover:underline">
        保存
      </button>
      <button onClick={onDone} className="text-[11px] text-ink-2 hover:underline">
        取消
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

  const refresh = async () => {
    try {
      setError('')
      setSessions(await listSessions())
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法加载会话列表')
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
      setError(err instanceof Error ? err.message : '无法创建会话')
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
      setError(err instanceof Error ? err.message : '无法关闭会话')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/20" onMouseDown={onClose} role="dialog" aria-label="会话管理">
      <aside
        className="h-full w-[min(340px,88vw)] border-r border-line bg-panel p-4 shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-semibold">会话</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-[12px] text-ink-2 hover:bg-ink/5 hover:text-ink">
            关闭
          </button>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => void onNew()}
            disabled={busy}
            className="flex-1 rounded-xl bg-brand px-3 py-2 text-[13px] font-medium text-white disabled:opacity-50"
          >
            + 新建会话
          </button>
          <button
            onClick={() => setShowSsh(true)}
            disabled={busy}
            className="flex-1 rounded-xl border border-line bg-canvas px-3 py-2 text-[13px] text-ink hover:bg-ink/5 disabled:opacity-50"
          >
            🔗 SSH
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
                  <div className="truncate text-[13px] font-medium">{displayName(session)}</div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setRenamingId(renamingId === session.id ? null : session.id)
                    }}
                    className="shrink-0 text-[10px] text-ink-2 hover:text-ink"
                    title="重命名终端"
                  >
                    ✎
                  </button>
                </div>
                <div className="mt-1 text-[11px] text-ink-2">
                  {session.connected ? '已连接' : '后台保活'} · {session.sandboxMode === 'bwrap' ? '隔离' : '本机'}
                  {session.sshTarget && <span className="text-brand-deep"> · SSH</span>}
                </div>
              </button>
              {renamingId === session.id && (
                <RenameInline session={session} onDone={() => setRenamingId(null)} />
              )}
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10px] text-ink-2">{new Date(session.lastActiveAt).toLocaleTimeString()}</span>
                <button
                  onClick={() => void onDelete(session)}
                  disabled={busy}
                  className="text-[11px] text-danger hover:underline disabled:opacity-50"
                >
                  关闭会话
                </button>
              </div>
            </div>
          ))}
          {!sessions.length && !error && <div className="py-8 text-center text-[12px] text-ink-2">暂无会话</div>}
        </div>
        {error && <div className="mt-3 text-[12px] text-danger">{error}</div>}
      </aside>
      {showSsh && <SshDialog onClose={() => setShowSsh(false)} />}
    </div>
  )
}
