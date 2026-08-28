import { memo, type ReactNode } from 'react'

interface StyleState {
  fg?: string
  bg?: string
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  inverse?: boolean
}

function get256Color(n: number): string {
  if (n < 16) {
    return `var(--term-color-${n})`
  }
  if (n >= 16 && n < 232) {
    // 6x6x6 color cube
    const idx = n - 16
    const b = idx % 6
    const g = Math.floor(idx / 6) % 6
    const r = Math.floor(idx / 36)
    const val = (c: number) => (c === 0 ? 0 : 55 + c * 40)
    return `rgb(${val(r)}, ${val(g)}, ${val(b)})`
  }
  if (n >= 232 && n <= 255) {
    // grayscale
    const gray = (n - 232) * 10 + 8
    return `rgb(${gray}, ${gray}, ${gray})`
  }
  return 'inherit'
}

/**
 * 将包含 ANSI SGR 转义码的字符串解析为带样式的 React 节点
 */
export function parseAnsiToReact(text: string): ReactNode[] {
  if (!text.includes('\x1b')) {
    return [text]
  }

  const nodes: ReactNode[] = []
  const ansiRe = /\x1b\[([0-9;]*)m/g
  let lastIndex = 0
  let currentStyle: StyleState = {}

  let match: RegExpExecArray | null
  let keyIndex = 0

  while ((match = ansiRe.exec(text)) !== null) {
    const rawChunk = text.slice(lastIndex, match.index)
    if (rawChunk.length > 0) {
      nodes.push(renderStyledSpan(rawChunk, currentStyle, keyIndex++))
    }
    lastIndex = ansiRe.lastIndex

    // 解析 SGR 参数
    const paramsStr = match[1] ?? ''
    const params = paramsStr.length === 0 ? [0] : paramsStr.split(';').map((p) => Number(p) || 0)

    let i = 0
    while (i < params.length) {
      const code = params[i]!
      if (code === 0) {
        currentStyle = {}
      } else if (code === 1) {
        currentStyle = { ...currentStyle, bold: true }
      } else if (code === 2) {
        currentStyle = { ...currentStyle, dim: true }
      } else if (code === 3) {
        currentStyle = { ...currentStyle, italic: true }
      } else if (code === 4) {
        currentStyle = { ...currentStyle, underline: true }
      } else if (code === 7) {
        currentStyle = { ...currentStyle, inverse: true }
      } else if (code === 22) {
        currentStyle = { ...currentStyle, bold: false, dim: false }
      } else if (code === 23) {
        currentStyle = { ...currentStyle, italic: false }
      } else if (code === 24) {
        currentStyle = { ...currentStyle, underline: false }
      } else if (code === 27) {
        currentStyle = { ...currentStyle, inverse: false }
      } else if (code >= 30 && code <= 37) {
        currentStyle = { ...currentStyle, fg: `var(--term-color-${code - 30})` }
      } else if (code === 38) {
        // 扩展前景色 (38;5;n 或 38;2;r;g;b)
        if (params[i + 1] === 5 && params[i + 2] !== undefined) {
          currentStyle = { ...currentStyle, fg: get256Color(params[i + 2]!) }
          i += 2
        } else if (
          params[i + 1] === 2 &&
          params[i + 2] !== undefined &&
          params[i + 3] !== undefined &&
          params[i + 4] !== undefined
        ) {
          currentStyle = {
            ...currentStyle,
            fg: `rgb(${params[i + 2]}, ${params[i + 3]}, ${params[i + 4]})`,
          }
          i += 4
        }
      } else if (code === 39) {
        currentStyle = { ...currentStyle, fg: undefined }
      } else if (code >= 40 && code <= 47) {
        currentStyle = { ...currentStyle, bg: `var(--term-color-${code - 40})` }
      } else if (code === 48) {
        // 扩展背景色
        if (params[i + 1] === 5 && params[i + 2] !== undefined) {
          currentStyle = { ...currentStyle, bg: get256Color(params[i + 2]!) }
          i += 2
        } else if (
          params[i + 1] === 2 &&
          params[i + 2] !== undefined &&
          params[i + 3] !== undefined &&
          params[i + 4] !== undefined
        ) {
          currentStyle = {
            ...currentStyle,
            bg: `rgb(${params[i + 2]}, ${params[i + 3]}, ${params[i + 4]})`,
          }
          i += 4
        }
      } else if (code === 49) {
        currentStyle = { ...currentStyle, bg: undefined }
      } else if (code >= 90 && code <= 97) {
        currentStyle = { ...currentStyle, fg: `var(--term-color-${code - 90 + 8})` }
      } else if (code >= 100 && code <= 107) {
        currentStyle = { ...currentStyle, bg: `var(--term-color-${code - 100 + 8})` }
      }
      i++
    }
  }

  const rest = text.slice(lastIndex)
  if (rest.length > 0) {
    nodes.push(renderStyledSpan(rest, currentStyle, keyIndex++))
  }

  return nodes
}

function renderStyledSpan(text: string, style: StyleState, key: number): ReactNode {
  const hasStyle =
    style.fg ||
    style.bg ||
    style.bold ||
    style.dim ||
    style.italic ||
    style.underline ||
    style.inverse

  if (!hasStyle) {
    return text
  }

  const inlineStyle: React.CSSProperties = {}
  if (style.fg) inlineStyle.color = style.fg
  if (style.bg) inlineStyle.backgroundColor = style.bg
  if (style.bold) inlineStyle.fontWeight = 'bold'
  if (style.dim) inlineStyle.opacity = 0.6
  if (style.italic) inlineStyle.fontStyle = 'italic'
  if (style.underline) inlineStyle.textDecoration = 'underline'
  if (style.inverse) {
    const tmp = inlineStyle.color
    inlineStyle.color = inlineStyle.backgroundColor || 'var(--color-canvas)'
    inlineStyle.backgroundColor = tmp || 'var(--color-ink)'
  }

  return (
    <span key={key} style={inlineStyle}>
      {text}
    </span>
  )
}

export const AnsiText = memo(function AnsiText({ text }: { text: string }) {
  return <>{parseAnsiToReact(text)}</>
})
