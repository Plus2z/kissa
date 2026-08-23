import { useState, type KeyboardEvent } from 'react'
import type { ChatMessage } from '../store'
import { useStore, COLLAPSE_THRESHOLD } from '../store'
import { net } from '../net'
import { useSettings } from '../settings'
import { Avatar } from './Avatar'
import { DiffView, JsonView } from './StructuredViews'

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m${Math.floor((ms % 60_000) / 1000)}s`
}

const COLLAPSED_HEAD_LINES = 8
const COLLAPSED_TAIL_LINES = 8

/**
 * 气泡内嵌输入组件:程序等待输入时(密码/确认/文本),直接在气泡里作答,
 * 不必切到终端视图。提交后由父组件切换为"已提交"遮蔽态,避免历史暴露明文。
 */
function InlineInput({
  kind,
  prompt,
  onSubmit,
}: {
  kind: 'password' | 'confirm' | 'text'
  prompt: string
  onSubmit: (value: string) => void
}) {
  const [value, setValue] = useState('')

  const submit = () => {
    const v = value
    setValue('')
    onSubmit(v)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
    e.stopPropagation()
  }

  return (
    <div className="border-t border-line/60 px-3.5 py-2.5">
      <div className="font-mono-term term-fs text-ink-2 mb-1.5 break-all">{prompt}</div>
      {kind === 'confirm' ? (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSubmit('y')}
            className="bg-brand rounded-lg px-3 py-1 text-[12px] font-medium text-white hover:opacity-90"
          >
            是 (y)
          </button>
          <button
            onClick={() => onSubmit('n')}
            className="rounded-lg border border-line px-3 py-1 text-[12px] text-ink hover:bg-ink/5"
          >
            否 (n)
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            type={kind === 'password' ? 'password' : 'text'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoComplete="off"
            placeholder={kind === 'password' ? '输入密码,回车提交' : '输入内容,回车提交'}
            className="font-mono-term term-fs min-w-0 flex-1 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-ink outline-none focus:border-brand"
          />
          <button
            onClick={submit}
            className="bg-brand rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-white hover:opacity-90"
          >
            提交
          </button>
        </div>
      )}
    </div>
  )
}

/** 输出气泡 = 微信"接收方"样式:白底、左对齐、左下小尾巴、发丝线描边 */
export function OutputBubble({ msg }: { msg: ChatMessage }) {
  const toggleCollapse = useStore((s) => s.toggleCollapse)
  const termAvatar = useSettings((s) => s.termAvatar)
  const inputRequest = useStore((s) => s.inputRequest)
  const [copied, setCopied] = useState(false)
  const [answered, setAnswered] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)

  // 本命令的活跃输入请求(read -p 场景输出为空也要显示输入组件)
  const activeInput =
    msg.status === 'running' && inputRequest?.commandId === msg.commandId ? inputRequest : null

  if (msg.content === '' && msg.status === 'running' && !activeInput) {
    return (
      <div className="flex items-end gap-2.5 px-4 py-1.5">
        <Avatar cfg={termAvatar} kind="term" />
        <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-line/60 bg-bubble-in px-4 py-2.5 shadow-sm">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
          <span className="text-[13px] text-ink-2">运行中…</span>
        </div>
      </div>
    )
  }

  // 去掉尾部空行再计数/切片,保证"最后几行"是真正有内容的结尾
  const lines = (msg.content ?? '').replace(/\n+$/, '').split('\n')
  const collapsible = lines.length > COLLAPSE_THRESHOLD
  const failed = msg.status === 'failed'

  const copy = async () => {
    await navigator.clipboard.writeText(msg.content ?? '')
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className="flex items-end gap-2.5 px-4 py-1.5">
      <Avatar cfg={termAvatar} kind="term" />
      <div
        className={
          'w-full max-w-[85%] overflow-hidden rounded-2xl rounded-bl-sm border bg-bubble-in shadow-sm ' +
          (failed ? 'border-danger/30' : 'border-line/60')
        }
      >
        {/* 状态栏 */}
        <div className="flex items-center gap-2 border-b border-line/60 bg-bubble-in px-3.5 py-1.5">
          {msg.status === 'running' ? (
            <>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
              <span className="text-[11px] text-ink-2">运行中</span>
              <button
                onClick={() => net.send({ type: 'stdin', data: '\x03' })}
                className="text-danger flex items-center gap-1 rounded-md border border-danger/30 px-1.5 py-0.5 text-[10px] hover:bg-danger-bg"
                title="发送 Ctrl+C"
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="5" y="5" width="14" height="14" rx="2" />
                </svg>
                停止
              </button>
            </>
          ) : msg.status === 'done' ? (
            <span className="text-brand-deep text-[11px] font-medium">✓ 完成</span>
          ) : msg.status === 'failed' ? (
            <span className="text-danger text-[11px] font-medium">
              ✗ 失败 · exit code {msg.exitCode ?? '?'}
            </span>
          ) : (
            <span className="text-[11px] text-ink-2">已结束</span>
          )}
          {msg.durationMs !== undefined && (
            <span className="text-[10px] text-ink-2">{fmtDuration(msg.durationMs)}</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {msg.structured && (
              <button
                onClick={() => setShowRaw((v) => !v)}
                className="text-[10px] text-ink-2 hover:text-ink"
                title="切换结构化视图与原始文本"
              >
                {showRaw ? '结构化视图' : '查看原文'}
              </button>
            )}
            {collapsible && !msg.structured && (
              <button
                onClick={() => toggleCollapse(msg.id)}
                className="text-[10px] text-ink-2 hover:text-ink"
              >
                {msg.collapsed ? `展开(共 ${lines.length} 行)` : '折叠'}
              </button>
            )}
            <button
              onClick={copy}
              className="text-[10px] text-ink-2 hover:text-ink"
              title="复制输出"
            >
              {copied ? '已复制' : '复制'}
            </button>
          </div>
        </div>

        {/* 内容:有结构化增强时优先渲染增强视图,可切回原文(降级路径) */}
        {msg.structured && !showRaw ? (
          msg.structured.kind === 'diff' ? (
            <DiffView data={msg.structured.data as never} />
          ) : (
            <JsonView data={msg.structured.data} />
          )
        ) : msg.collapsed ? (
          <>
            <pre className="font-mono-term term-fs text-bubble-in-ink overflow-x-auto px-3.5 py-2 leading-[1.55] whitespace-pre-wrap">
              {lines.slice(0, COLLAPSED_HEAD_LINES).join('\n')}
            </pre>
            <button
              onClick={() => toggleCollapse(msg.id)}
              className="mx-3.5 my-1 flex w-[calc(100%-1.75rem)] items-center gap-2 rounded-md border border-dashed border-line px-3 py-1.5 text-left text-[11px] text-ink-2 hover:border-ink-2/50 hover:text-ink"
            >
              ⋯ 中间已折叠 {lines.length - COLLAPSED_HEAD_LINES - COLLAPSED_TAIL_LINES} 行,点击展开完整输出(共{' '}
              {lines.length} 行)
            </button>
            <pre className="font-mono-term term-fs text-bubble-in-ink overflow-x-auto px-3.5 pb-2 leading-[1.55] whitespace-pre-wrap">
              {lines.slice(-COLLAPSED_TAIL_LINES).join('\n')}
            </pre>
          </>
        ) : (
          <pre className="font-mono-term term-fs text-bubble-in-ink overflow-x-auto px-3.5 py-2 leading-[1.55] whitespace-pre-wrap">
            {lines.join('\n')}
          </pre>
        )}

        {/* 等待输入:气泡内嵌作答;已提交则显示遮蔽态,历史不暴露明文 */}
        {activeInput ? (
          <InlineInput
            kind={activeInput.kind}
            prompt={activeInput.prompt}
            onSubmit={(v) => {
              net.send({ type: 'stdin', data: v + '\n' })
              setAnswered(activeInput.kind === 'password' ? '••••••' : v)
            }}
          />
        ) : (
          answered !== null &&
          msg.status === 'running' && (
            <div className="border-t border-line/60 px-3.5 py-2 text-[11px] text-ink-2">
              已提交:{answered}
            </div>
          )
        )}
      </div>
    </div>
  )
}
