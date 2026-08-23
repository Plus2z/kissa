import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useStore, selectRunning } from '../store'
import { net, setCompletionHandler, matchDangerClient } from '../net'
import type { DangerRule } from '../protocol'
import type { ServerMessage } from '../protocol'

let seq = 0

type CompletionMsg = Extract<ServerMessage, { type: 'completion' }>

interface CompState {
  items: string[]
  dirs: Set<string>
  start: number
  end: number
  mode: 'command' | 'file'
  sel: number
}

function commonPrefix(items: string[]): string {
  if (items.length === 0) return ''
  let p = items[0]!
  for (const s of items.slice(1)) {
    let i = 0
    while (i < p.length && i < s.length && p[i] === s[i]) i++
    p = p.slice(0, i)
  }
  return p
}

/** 应用补全词到输入框;含空格等字符时做最小转义(贴近 readline 行为) */
function quoteIfNeeded(word: string): string {
  if (/[\s"'`$*?[\]{}~]/.test(word) && !word.includes('\\')) {
    return word.replace(/([\s"'`$*?[\]{}~])/g, '\\$1')
  }
  return word
}

export function InputBar() {
  const messages = useStore((s) => s.messages)
  const connStatus = useStore((s) => s.connStatus)
  const fullscreen = useStore((s) => s.fullscreen)
  const boundaryDepth = useStore((s) => s.boundaryDepth)
  const inputRequest = useStore((s) => s.inputRequest)
  const running = !!selectRunning(messages, boundaryDepth) || fullscreen.active || !!inputRequest
  const [value, setValue] = useState('')
  const [comp, setComp] = useState<CompState | null>(null)
  /** 危险命令待确认状态(前端预检;服务端仍是权威拦截层) */
  const [danger, setDanger] = useState<{ rule: DangerRule; text: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const tokenRef = useRef(0)
  const contextRef = useRef<{ text: string; cursor: number } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setCompletionHandler((msg: CompletionMsg) => {
      if (msg.token !== tokenRef.current) return
      // 过期响应:用户已继续输入或移动光标
      const el = inputRef.current
      const ctx = contextRef.current
      if (!el || !ctx || ctx.text !== value || (el.selectionStart ?? value.length) !== ctx.cursor)
        return

      const dirs = new Set(msg.dirs)
      if (msg.items.length === 0) {
        setComp(null)
        return
      }
      if (msg.items.length === 1) {
        applyWord(msg.items[0]!, msg, dirs, true)
        return
      }
      // 多候选:先补到公共前缀(不闭层,继续 Tab 循环)
      const prefix = commonPrefix(msg.items)
      const word = value.slice(msg.start, msg.end)
      if (prefix.length > word.length) {
        const next = value.slice(0, msg.start) + prefix + value.slice(msg.end)
        setValue(next)
        requestAnimationFrame(() => {
          el.focus()
          el.setSelectionRange(msg.start + prefix.length, msg.start + prefix.length)
        })
      }
      setComp({ items: msg.items, dirs, start: msg.start, end: msg.end, mode: msg.mode, sel: -1 })
    })
    return () => setCompletionHandler(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const applyWord = (
    word: string,
    range: { start: number; end: number },
    dirs: Set<string>,
    withSuffix: boolean,
  ) => {
    const el = inputRef.current
    const quoted = quoteIfNeeded(word)
    const suffix = !withSuffix ? '' : dirs.has(word) ? '/' : ' '
    const next = value.slice(0, range.start) + quoted + suffix + value.slice(range.end)
    setValue(next)
    const caret = range.start + quoted.length + suffix.length
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(caret, caret)
    })
    if (withSuffix) setComp(null)
  }

  const requestCompletion = () => {
    const el = inputRef.current
    if (!el) return
    const cursor = el.selectionStart ?? value.length
    tokenRef.current = ++seq
    contextRef.current = { text: value, cursor }
    net.send({ type: 'complete', token: tokenRef.current, text: value, cursor })
  }

  // 选中项滚动到可见
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-sel="true"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [comp?.sel])

  const submit = (confirmed = false) => {
    const text = value
    if (!text.trim()) return
    if (running) {
      setValue('')
      setComp(null)
      net.send({ type: 'stdin', data: text + '\n' })
      return
    }
    if (boundaryDepth > 0) {
      // 嵌套 Shell 场景：命令通过 stdin 流入远程 PTY，由哨兵/OSC133 自动切分子命令气泡
      setValue('')
      setComp(null)
      setDanger(null)
      net.send({ type: 'stdin', data: text + '\n' })
      return
    }
    if (!confirmed) {
      const rule = matchDangerClient(text)
      if (rule) {
        setDanger({ rule, text })
        return // 先确认,不发送
      }
    }
    setValue('')
    setComp(null)
    setDanger(null)
    net.send({ type: 'command', text, clientMsgId: `c${Date.now()}-${seq++}`, confirmed })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Ctrl+C:运行中即中断(经典终端行为);未运行时保持浏览器默认(复制)
    if (e.ctrlKey && e.key.toLowerCase() === 'c' && running) {
      e.preventDefault()
      net.send({ type: 'stdin', data: '\x03' })
      return
    }

    // 候选弹层导航
    if (comp && comp.items.length > 0) {
      if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault()
        const sel = (comp.sel + 1) % comp.items.length
        setComp({ ...comp, sel })
        applyWord(comp.items[sel]!, comp, comp.dirs, false)
        return
      }
      if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
        e.preventDefault()
        const sel = (comp.sel - 1 + comp.items.length) % comp.items.length
        setComp({ ...comp, sel })
        applyWord(comp.items[sel]!, comp, comp.dirs, false)
        return
      }
      if (e.key === 'Enter') {
        if (comp.sel >= 0) {
          // 确认选中项,不立即执行命令
          e.preventDefault()
          applyWord(comp.items[comp.sel]!, comp, comp.dirs, true)
          return
        }
        setComp(null) // 未选中:按普通回车提交
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setComp(null)
        return
      }
    } else if (e.key === 'Tab' && !running) {
      e.preventDefault()
      requestCompletion()
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }

  return (
    /* 微信式底栏:白底 + 发丝线,输入框浅灰圆角,右侧圆形绿色发送钮 */
    <footer className="shrink-0 border-t border-line bg-panel p-4">
      <div className="relative flex items-end gap-3">
        {/* 危险命令确认:命中规则先确认再发送;服务端会再拦一道未确认的 */}
        {danger && (
          <div className="absolute bottom-full left-0 z-10 mb-2 w-full rounded-xl border border-danger/40 bg-danger-bg px-4 py-3 shadow-lg shadow-black/10">
            <div className="text-danger-ink mb-1 text-[13px] font-medium">
              ⚠️ 危险命令,确认执行?
            </div>
            <div className="font-mono-term term-fs text-danger-ink/90 mb-1 break-all">{danger.text}</div>
            <div className="mb-2.5 text-[11px] text-danger-ink/70">{danger.rule.message}</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => submit(true)}
                className="bg-danger rounded-lg px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
              >
                仍要执行
              </button>
              <button
                onClick={() => setDanger(null)}
                className="rounded-lg border border-line bg-panel px-3 py-1.5 text-[12px] text-ink hover:bg-ink/5"
              >
                取消
              </button>
              <span className="ml-auto text-[10px] text-danger-ink/50">服务端同样拦截未确认的危险命令</span>
            </div>
          </div>
        )}
        {/* Tab 补全候选弹层(浅色) */}
        {comp && comp.items.length > 0 && (
          <div
            ref={listRef}
            className="absolute bottom-full left-0 z-10 mb-2 max-h-56 w-full overflow-auto rounded-xl border border-line bg-panel py-1 shadow-xl shadow-black/10"
          >
            <div className="px-3 py-1 text-[10px] text-ink-2">
              {comp.mode === 'command' ? '命令' : '文件'} · 共 {comp.items.length} 项 · Tab 循环 ↑↓
              选择 Enter 确认 Esc 关闭
            </div>
            {comp.items.map((item, i) => (
              <div
                key={item}
                data-sel={i === comp.sel}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyWord(item, comp, comp.dirs, true)}
                className={
                  'font-mono-term cursor-pointer truncate px-3 py-1 text-[12px] ' +
                  (i === comp.sel
                    ? 'bg-brand-bg text-brand-deep'
                    : 'text-ink hover:bg-ink/5')
                }
              >
                {comp.dirs.has(item) ? `${item}/` : item}
              </div>
            ))}
          </div>
        )}

        {/* 左侧:运行中显示停止 */}
        <div className="flex items-center gap-1 pb-1.5">
          {running ? (
            <button
              onClick={() => net.send({ type: 'stdin', data: '\x03' })}
              className="text-danger flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-danger-bg"
              title="发送 Ctrl+C"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="5" y="5" width="14" height="14" rx="3" />
              </svg>
            </button>
          ) : (
            <button
              onClick={requestCompletion}
              className="flex h-10 w-10 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink"
              title="Tab 补全"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7h14l-4-4" />
                <path d="M21 17H7l4 4" />
              </svg>
            </button>
          )}
        </div>

        {/* 输入框 */}
        <div className="flex min-h-[46px] flex-1 items-center rounded-xl border border-line bg-canvas px-4 py-2.5 shadow-sm transition-all focus-within:border-brand focus-within:ring-1 focus-within:ring-brand">
          <span className="font-mono-term mr-2 text-sm text-brand-deep">❯</span>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setComp(null)
              setDanger(null)
            }}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoComplete="off"
            disabled={connStatus !== 'ready' && connStatus !== 'connecting'}
            placeholder={
              connStatus === 'ready'
                ? running
                  ? fullscreen.active
                    ? '全屏程序运行中(在终端视图里交互),此处输入将发送给程序'
                    : '命令运行中,回车将作为输入发送(Ctrl+C 中断)'
                  : '输入命令,回车执行 · Tab 补全'
                : '等待连接…'
            }
            className="font-mono-term term-fs min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-2"
          />
        </div>

        {/* 右侧:圆形绿色发送钮 */}
        <button
          onClick={() => submit()}
          disabled={!value.trim()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-sm transition-all hover:bg-[#06b057] active:scale-95 disabled:opacity-40"
          title="发送"
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3.4 20.4l17.45-7.48a1 1 0 0 0 0-1.84L3.4 3.6a.993.993 0 0 0-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" />
          </svg>
        </button>
      </div>
    </footer>
  )
}
