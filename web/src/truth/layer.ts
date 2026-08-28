/**
 * 终端真相层:全系统的事实来源。
 *
 * 三部分:
 * 1. 回放缓冲(replay buffer)——完整保留会话至今的 PTY 原始字节(上限内),
 *    供任意时刻重建终端视图;
 * 2. 常驻的无头终端状态机(@xterm/headless)——持续消费字节流,维护正确的
 *    屏幕状态,后续阶段的全屏程序检测、结构化增强都从这里读事实;
 * 3. 可拆卸的可见终端(@xterm/xterm)——用户打开"终端视图"时挂载,先重放
 *    缓冲再接实时流;卸载即销毁,不影响真相层。
 *
 * 增强层(聊天气泡)不在本文件管辖范围——它们只是旁路消费者,坏了也不影响这里。
 */

import { Terminal as HeadlessTerminal } from '@xterm/headless'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import {
  COLOR_SCHEMES,
  type ColorSchemeId,
  type ThemeMode,
} from '../settings'

/** 回放缓冲上限:4MB,超出后丢弃最旧的字节(真相层退化为"从最近 4MB 开始") */
const REPLAY_LIMIT = 4 * 1024 * 1024

export interface TerminalDisplayOptions {
  fontSize?: number
  fontFamily?: string
  colorScheme?: ColorSchemeId
  themeMode?: ThemeMode
}

export function getXtermTheme(schemeId: ColorSchemeId = 'default', mode: ThemeMode = 'dark'): ITheme {
  const dark =
    mode === 'dark' ||
    (mode === 'auto' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)
  const scheme = COLOR_SCHEMES[schemeId] ?? COLOR_SCHEMES.default
  const c = dark ? scheme.colors.dark : scheme.colors.light

  return {
    background: dark ? '#0d1015' : '#f7f7f7',
    foreground: dark ? '#d7dbe2' : '#191919',
    cursor: dark ? '#3fd47f' : '#07c160',
    selectionBackground: dark ? '#143126' : '#e7f7ee',
    selectionForeground: dark ? '#ffffff' : '#000000',
    black: c[0],
    red: c[1],
    green: c[2],
    yellow: c[3],
    blue: c[4],
    magenta: c[5],
    cyan: c[6],
    white: c[7],
    brightBlack: c[8],
    brightRed: c[9],
    brightGreen: c[10],
    brightYellow: c[11],
    brightBlue: c[12],
    brightMagenta: c[13],
    brightCyan: c[14],
    brightWhite: c[15],
  }
}

class TruthLayer {
  private headless = new HeadlessTerminal({ cols: 80, rows: 24, scrollback: 5000 })
  private replay: Uint8Array[] = []
  private replayBytes = 0
  private term: Terminal | null = null
  private fit: FitAddon | null = null
  private resizeObserver: ResizeObserver | null = null
  /** 重放进行中:屏蔽 xterm 对历史终端查询的自动应答(见 attach) */
  private replaying = false

  /** 消费一条 raw 消息(base64)。永远先写真相层,任何增强逻辑不得出现在这里。 */
  feed(base64: string): void {
    const bin = atob(base64)
    const u8 = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)

    this.replay.push(u8)
    this.replayBytes += u8.length
    while (this.replayBytes > REPLAY_LIMIT && this.replay.length > 1) {
      this.replayBytes -= this.replay.shift()!.length
    }

    this.headless.write(u8)
    this.term?.write(u8)
  }

  /** 挂载可见终端视图(降级路径)。返回后调用方负责布局。 */
  attach(
    el: HTMLElement,
    onData: (data: string) => void,
    onResize: (cols: number, rows: number) => void,
    opts: TerminalDisplayOptions = {},
  ): void {
    if (this.term) return
    const fontSize = opts.fontSize ?? 13
    const fontFamily =
      !opts.fontFamily || opts.fontFamily === 'default'
        ? '"JetBrains Mono", "Fira Code", ui-monospace, Menlo, Consolas, monospace'
        : `"${opts.fontFamily}", "JetBrains Mono", "Fira Code", ui-monospace, monospace`
    const theme = getXtermTheme(opts.colorScheme, opts.themeMode)

    const term = new Terminal({
      fontFamily,
      fontSize,
      theme,
      scrollback: 5000,
      convertEol: false,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    this.term = term
    this.fit = fit

    /**
     * 重放真相层缓冲。重放期间屏蔽 onData:历史字节里包含 shell 提示符框架
     * 发出的终端能力查询(OSC 10/11 颜色、DA 等),xterm 收到会自动应答,
     * 应答若不被屏蔽就会作为 stdin 打进 PTY——表现为"一打开终端视图就输入乱码"。
     * 写入按序串行,最后一个 chunk 消化完再延迟解除屏蔽(等 write 队列排空)。
     */
    this.replaying = true
    let i = 0
    const step = () => {
      if (i >= this.replay.length) {
        setTimeout(() => {
          this.replaying = false
        }, 150)
        return
      }
      const chunk = this.replay[i++]!
      term.write(chunk, step)
    }
    step()
    term.onData((data) => {
      if (!this.replaying) onData(data)
    })
    try {
      fit.fit()
    } catch {
      /* 容器尚无尺寸时忽略,ResizeObserver 会再触发 */
    }

    this.resizeObserver = new ResizeObserver(() => {
      try {
        this.fit?.fit()
        onResize(term.cols, term.rows)
      } catch {
        /* 忽略瞬态尺寸 */
      }
    })
    this.resizeObserver.observe(el)
    term.focus()
    onResize(term.cols, term.rows)
  }

  updateOptions(opts: TerminalDisplayOptions): void {
    if (!this.term) return
    if (opts.fontSize !== undefined) {
      this.term.options.fontSize = opts.fontSize
    }
    if (opts.fontFamily !== undefined) {
      this.term.options.fontFamily =
        !opts.fontFamily || opts.fontFamily === 'default'
          ? '"JetBrains Mono", "Fira Code", ui-monospace, Menlo, Consolas, monospace'
          : `"${opts.fontFamily}", "JetBrains Mono", "Fira Code", ui-monospace, monospace`
    }
    if (opts.colorScheme !== undefined || opts.themeMode !== undefined) {
      this.term.options.theme = getXtermTheme(opts.colorScheme, opts.themeMode)
    }
    try {
      this.fit?.fit()
    } catch {
      /* 忽略 */
    }
  }

  /** 卸载可见终端。真相层(回放缓冲 + 无头状态机)继续运转。 */
  detach(): void {
    this.replaying = false
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.term?.dispose()
    this.term = null
    this.fit = null
  }

  get attached(): boolean {
    return this.term !== null
  }

  get hasContent(): boolean {
    return this.replay.length > 0
  }

  /** 新会话开始:清空回放缓冲与无头状态机(可见实例随 detach 一起处理) */
  reset(): void {
    this.detach()
    this.replay = []
    this.replayBytes = 0
    this.headless.dispose()
    this.headless = new HeadlessTerminal({ cols: 80, rows: 24, scrollback: 5000 })
  }
}

/** 每个页面加载一个会话(阶段一:单会话模型) */
export const truthLayer = new TruthLayer()
