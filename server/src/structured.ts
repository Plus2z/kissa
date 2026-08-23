/**
 * 结构化输出解析(标注层的一部分,命令结束时旁路生成)。
 * 解析失败一律返回 null,前端降级为纯文本——不因增强而丢内容。
 */

/** diff 视图数据:按文件分块,块内按 hunk 分组,行级增删上下 */
export interface DiffData {
  files: Array<{
    path: string
    additions: number
    deletions: number
    isBinary: boolean
    hunks: Array<{
      header: string
      lines: Array<{ type: 'add' | 'del' | 'ctx' | 'meta'; text: string }>
    }>
  }>
}

/** 解析上限:防御巨型 diff */
const MAX_DIFF_LINES = 8000

export function parseDiff(text: string): DiffData | null {
  const lines = text.split('\n')
  if (lines.length < 3 || lines.length > MAX_DIFF_LINES) return null

  const files: DiffData['files'] = []
  let curFile: DiffData['files'][number] | null = null
  let curHunk: DiffData['files'][number]['hunks'][number] | null = null
  let sawDiffHeader = false

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      sawDiffHeader = true
      const m = line.match(/^diff --git a\/(.+) b\/(.+)$/)
      curFile = {
        path: m?.[2] ?? line.slice(11),
        additions: 0,
        deletions: 0,
        isBinary: false,
        hunks: [],
      }
      files.push(curFile)
      curHunk = null
      continue
    }
    if (!curFile) continue
    if (line.startsWith('Binary files ') || line.startsWith('GIT binary patch')) {
      curFile.isBinary = true
      continue
    }
    if (line.startsWith('@@ ')) {
      curHunk = { header: line, lines: [] }
      curFile.hunks.push(curHunk)
      continue
    }
    if (!curHunk) continue // ---/+++/index/new file mode 等文件级元信息,视图里省略
    if (line.startsWith('+')) {
      curFile.additions++
      curHunk.lines.push({ type: 'add', text: line.slice(1) })
    } else if (line.startsWith('-')) {
      curFile.deletions++
      curHunk.lines.push({ type: 'del', text: line.slice(1) })
    } else if (line.startsWith(' ')) {
      curHunk.lines.push({ type: 'ctx', text: line.slice(1) })
    } else if (line.startsWith('\\')) {
      curHunk.lines.push({ type: 'meta', text: line })
    }
  }

  if (!sawDiffHeader || files.length === 0) return null
  return { files }
}

/** JSON 检测:去掉 ANSI/空白后以 { 或 [ 开头且能完整解析;超大不解析 */
export function parseJson(text: string, maxChars = 200_000): unknown | null {
  const t = text.trim()
  if (t.length < 2 || t.length > maxChars) return null
  if (!t.startsWith('{') && !t.startsWith('[')) return null
  // jq/管道后可能带尾随统计行之类,只接受整体可解析的纯 JSON
  try {
    return JSON.parse(t)
  } catch {
    return null
  }
}
