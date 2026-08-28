/**
 * 新建 SSH 连接弹窗:输入 user@host[:port] 直接连接;
 * 展示 SSH 历史记录(最近使用排序),点击即填充,可删除单条。
 */

import { useEffect, useState, type KeyboardEvent } from 'react'
import {
  createSshSession,
  listSshHosts,
  parseSshTargetInput,
  removeSshHost,
  switchSession,
  type SshHost,
  type SshTargetInput,
} from '../net'
import { useSettings } from '../settings'
import { t } from '../i18n'

function labelOf(h: SshHost): string {
  return h.user ? `${h.user}@${h.host}` : h.host
}

export function SshDialog({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState('')
  const [hosts, setHosts] = useState<SshHost[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const language = useSettings((s) => s.language)
  const tr = t(language)

  const refresh = async () => {
    try {
      setHosts(await listSshHosts())
    } catch {
      /* 历史拉不到不阻塞连接 */
    }
  }
  useEffect(() => {
    void refresh()
  }, [])

  const connect = async (target: SshTargetInput) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const session = await createSshSession(target)
      switchSession(session.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : tr.connectFailed)
      setBusy(false)
    }
  }

  const connectFromInput = () => {
    const parsed = parseSshTargetInput(value)
    if (!parsed) {
      setError(tr.formatError)
      return
    }
    void connect(parsed)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') connectFromInput()
  }

  const onDelete = async (h: SshHost) => {
    try {
      setHosts(await removeSshHost({ user: h.user, host: h.host, port: h.port }))
    } catch {
      /* 删除失败忽略 */
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
      onMouseDown={onClose}
      role="dialog"
      aria-label={tr.sshDialogTitle}
    >
      <div
        className="w-[min(420px,90vw)] rounded-2xl border border-line bg-panel p-5 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-semibold">{tr.sshDialogTitle}</h3>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-[12px] text-ink-2 hover:bg-ink/5 hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoComplete="off"
            placeholder={tr.sshInputPlaceholder}
            className="font-mono-term term-fs min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 py-2 text-ink outline-none focus:border-brand"
          />
          <button
            onClick={connectFromInput}
            disabled={busy || !value.trim()}
            className="shrink-0 rounded-lg bg-brand px-3.5 py-2 text-[13px] font-medium text-white disabled:opacity-40"
          >
            {tr.connect}
          </button>
        </div>
        {error && <div className="mt-2 text-[12px] text-danger">{error}</div>}

        {hosts.length > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 text-[11px] text-ink-2">{tr.recentConnections}</div>
            <div className="max-h-56 space-y-1 overflow-auto">
              {hosts.map((h) => (
                <div
                  key={`${h.user}@${h.host}:${h.port}`}
                  className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-1.5"
                >
                  <button
                    onClick={() => void connect({ user: h.user, host: h.host, port: h.port })}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    title={labelOf(h)}
                  >
                    <span className="font-mono-term term-fs truncate text-ink">{labelOf(h)}</span>
                    {h.port !== 22 && <span className="shrink-0 text-[10px] text-ink-2">:{h.port}</span>}
                    <span className="shrink-0 text-[10px] text-ink-2">{h.times} {tr.times}</span>
                  </button>
                  <button
                    onClick={() => void onDelete(h)}
                    className="shrink-0 text-[11px] text-ink-2 hover:text-danger"
                    title={tr.deleteRecord}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
