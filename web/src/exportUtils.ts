import type { ChatMessage } from './store'

function fmtTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleString()
}

export function formatSessionAsMarkdown(
  messages: ChatMessage[],
  opts?: { sessionName?: string; hostname?: string; targetName?: string },
): string {
  const title = opts?.sessionName || opts?.targetName || opts?.hostname || 'Kissa Session'
  const timeStr = new Date().toLocaleString()
  const header: string[] = [
    `# ${title} - 对话终端记录`,
    '',
    `- **导出时间**: ${timeStr}`,
  ]
  if (opts?.hostname) header.push(`- **主机名**: \`${opts.hostname}\``)
  if (opts?.targetName) header.push(`- **目标环境**: \`${opts.targetName}\``)
  header.push('', '---', '')

  const lines: string[] = [...header]

  for (const msg of messages) {
    if (msg.kind === 'system') {
      lines.push(`> ℹ️ *${msg.text}* (${fmtTime(msg.ts)})`)
      lines.push('')
    } else if (msg.kind === 'command') {
      const cwdStr = msg.cwd ? ` \`${msg.cwd}\`` : ''
      lines.push(`### ❯ \`${msg.text}\``)
      lines.push(`*${fmtTime(msg.ts)}${cwdStr ? ' in ' + cwdStr : ''}*`)
      lines.push('')
    } else if (msg.kind === 'output') {
      const statusText =
        msg.status === 'done'
          ? '✓ 成功'
          : msg.status === 'failed'
          ? `✗ 失败 (exit code: ${msg.exitCode ?? '?'})`
          : '已结束'
      const duration = msg.durationMs !== undefined ? ` · 耗时 ${msg.durationMs}ms` : ''
      lines.push(`**状态**: ${statusText}${duration}`)
      lines.push('')
      const cleanContent = (msg.content ?? '').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\n+$/, '')
      if (cleanContent.trim().length > 0) {
        lines.push('```bash')
        lines.push(cleanContent)
        lines.push('```')
      } else {
        lines.push('*（无输出）*')
      }
      lines.push('')
      lines.push('---')
      lines.push('')
    }
  }

  return lines.join('\n')
}

export function downloadMarkdown(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
