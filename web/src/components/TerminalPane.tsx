import { useEffect, useRef } from 'react'
import { truthLayer } from '../truth/layer'
import { net } from '../net'
import { useStore } from '../store'
import { useSettings } from '../settings'

/**
 * 终端视图:真相层的可见形态(降级路径)。
 * 挂载时重放回放缓冲并接实时流;卸载只销毁可见实例,真相层继续运转。
 * 面板保持深色——这是终端的本色,不随聊天层换肤。
 */
export function TerminalPane({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const fontSize = useSettings((s) => s.fontSize)
  const fullscreen = useStore((s) => s.fullscreen)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    truthLayer.attach(
      el,
      (data) => net.send({ type: 'stdin', data }),
      (cols, rows) => net.send({ type: 'resize', cols, rows }),
      Math.round(fontSize),
    )
    return () => truthLayer.detach()
  }, [fontSize])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line bg-bar px-4 py-1.5">
        <span className="text-[11px] text-ink-2">
          {fullscreen.active
            ? '全屏程序运行中 — 键盘直接操作程序,退出后自动返回对话'
            : '真实终端(事实来源)— 键盘输入直接进入 PTY'}
        </span>
        <button
          onClick={onClose}
          className="ml-auto rounded-lg px-2 py-1 text-[11px] text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink"
        >
          关闭
        </button>
      </div>
      <div ref={ref} className="min-h-0 flex-1 bg-[#0b0e14]" />
    </div>
  )
}
