/**
 * Tab 补全计算(增强层的一部分,但独立于 PTY 会话)。
 *
 * 聊天输入框的行编辑发生在浏览器,不在 bash 的 readline 里,所以不能靠往
 * 会话 PTY 里发 \t(那会把字符写进真实的 readline 行缓冲)。改为:起一个
 * 一次性的辅助 bash 进程,在会话当前 cwd 下用 compgen 计算候选——
 *   - 命令位(行首/;|&({ 之后):compgen -c
 *   - 参数位:compgen -f / -d
 * 实测 compgen 的 word 参数为纯前缀匹配(非 glob),对两种模式一致。
 * 辅助进程非交互、不加载 rc,不污染会话历史与输出。
 */

import { execFile } from 'node:child_process'

const TIMEOUT_MS = 700
const MAX_ITEMS = 500

/** 词边界:空白与常见 shell 元字符(含 =,便于 --opt= 后的路径补全) */
const BOUNDARY = /[\s;|&<>(){}$`'"=]/

export interface WordContext {
  word: string
  start: number
  end: number
  mode: 'command' | 'file'
}

/** 命令前缀穿透:这些命令之后的下一个词仍是命令位(sudo ap<Tab> 补命令而非文件) */
const CMD_PREFIXES = new Set(['sudo', 'env', 'nohup', 'time', 'command', 'exec', 'nice', 'builtin'])

/** 取 text 中 cursor 处的词及其范围,并判断命令位/参数位 */
export function wordContextAt(text: string, cursor: number): WordContext {
  let start = cursor
  while (start > 0 && !BOUNDARY.test(text[start - 1]!)) start--
  let end = cursor
  while (end < text.length && !BOUNDARY.test(text[end]!)) end++
  const word = text.slice(start, end)

  const mode: WordContext['mode'] = commandPosition(text, start) ? 'command' : 'file'
  return { word, start, end, mode }
}

/** 光标词(text[start..end])之前的文本处于"命令位"则返回 true */
function commandPosition(text: string, start: number): boolean {
  // 光标左侧最近的命令分隔符:片段起点(片段的第一个词总是命令位)
  let segStart = 0
  for (let i = 0; i < start; i++) {
    if (';|&({'.includes(text[i]!)) segStart = i + 1
  }
  // 光标词之前的 token 序列(片段内)
  const prefix = text.slice(segStart, start).trim()
  const tokens = prefix.length > 0 ? prefix.split(/\s+/) : []
  if (tokens.length === 0) return true
  // 片段首词为穿透前缀(sudo/env/...):其后的第一个"非选项/非赋值"词仍是命令位
  return CMD_PREFIXES.has(tokens[0]!) && isCommandAfterPrefix(tokens)
}

/** 穿透前缀之后,光标词是否仍是"第一个命令位"(选项/赋值/选项值已被跳过) */
function isCommandAfterPrefix(tokens: string[]): boolean {
  let i = 1
  while (i < tokens.length) {
    const t = tokens[i]!
    // sudo -u <user>:选项带一个值,值本身不是命令
    if (t === '-u' || t === '--user') {
      i += 2
      if (i - 1 >= tokens.length) return false // -u 后无值:光标词是用户值(非命令位)
      continue
    }
    // 其余选项与 VAR=val 赋值:单 token 跳过
    if (t.startsWith('-') || /^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) {
      i += 1
      continue
    }
    return false // 命令本体已出现:光标词是它的参数
  }
  return true // 选项/赋值全部跳过,光标词是第一个命令位
}

/** 单引号安全包裹 */
function shQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

export interface CompletionResult {
  items: string[]
  /** items 中是目录的集合(用于前端决定补 '/' 还是 ' ') */
  dirs: Set<string>
}

export function computeCompletions(
  text: string,
  cursor: number,
  cwd: string,
): Promise<CompletionResult & WordContext> {
  const ctx = wordContextAt(text, cursor)
  // 空词:不补全(避免全量列表)
  if (ctx.word === '') return Promise.resolve({ items: [], dirs: new Set(), ...ctx })

  let script: string
  if (ctx.mode === 'command') {
    script = `compgen -c -- ${shQuote(ctx.word)} 2>/dev/null | sort -u | head -n ${MAX_ITEMS}`
  } else {
    // 同时取目录列表用于 '/' 后缀判断
    const w = shQuote(ctx.word)
    script =
      `compgen -f -- ${w} 2>/dev/null | head -n ${MAX_ITEMS}` +
      `; printf '\\x1e\\n'` +
      `; compgen -d -- ${w} 2>/dev/null | head -n ${MAX_ITEMS}`
  }

  return new Promise((resolve) => {
    execFile(
      'bash',
      ['-c', script],
      { cwd, timeout: TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024 },
      (err, stdout) => {
        const items = new Set<string>()
        const dirs = new Set<string>()
        if (!err && stdout) {
          const parts = stdout.split('\x1e\n')
          for (const line of parts[0].split('\n')) {
            if (line) items.add(line)
          }
          if (parts.length > 1) {
            for (const line of parts[1].split('\n')) {
              if (line) {
                dirs.add(line)
                items.add(line)
              }
            }
          }
        }
        const list = [...items].sort((a, b) => a.localeCompare(b)).slice(0, MAX_ITEMS)
        resolve({ items: list, dirs, ...ctx })
      },
    )
  })
}
