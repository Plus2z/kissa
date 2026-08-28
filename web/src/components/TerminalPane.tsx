import { useEffect, useRef } from 'react'
import { truthLayer } from '../truth/layer'
import { net } from '../net'
import { useStore } from '../store'
import { useSettings } from '../settings'
import { t } from '../i18n'

/**
 * 终端视图:真相层的可见形态(降级路径与全屏程序交互通道)。
 * 挂载时重放回放缓冲并接实时流;卸载只销毁可见实例,真相层继续运转。
 * 完美联动用户的字号、字体族与 16 色终端配色方案。
 */
export function TerminalPane({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const fontSize = useSettings((s) => s.fontSize)
  const fontFamily = useSettings((s) => s.fontFamily)
  const colorScheme = useSettings((s) => s.colorScheme)
  const theme = useSettings((s) => s.theme)
  const language = useSettings((s) => s.language)
  const fullscreen = useStore((s) => s.fullscreen)

  const tr = t(language)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    truthLayer.attach(
      el,
      (data) => net.send({ type: 'stdin', data }),
      (cols, rows) => net.send({ type: 'resize', cols, rows }),
      {
        fontSize: Math.round(fontSize),
        fontFamily,
        colorScheme,
        themeMode: theme,
      },
    )
    return () => truthLayer.detach()
  }, [])

  useEffect(() => {
    truthLayer.updateOptions({
      fontSize: Math.round(fontSize),
      fontFamily,
      colorScheme,
      themeMode: theme,
    })
  }, [fontSize, fontFamily, colorScheme, theme])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line bg-bar px-4 py-1.5">
        <span className="text-[11px] text-ink-2">
          {fullscreen.active
            ? tr.terminalPaneSubFullscreen
            : tr.terminalPaneSubTruth}
        </span>
        <button
          onClick={onClose}
          className="ml-auto rounded-lg px-2 py-1 text-[11px] text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink"
        >
          {tr.close}
        </button>
      </div>
      <div ref={ref} className="min-h-0 flex-1 bg-surface" />
    </div>
  )
}
