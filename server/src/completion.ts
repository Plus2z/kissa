/**
 * Tab 补全计算(增强层的一部分,但独立于 PTY 会话)。
 *
 * 聊天输入框的行编辑发生在浏览器,不在 bash 的 readline 里,所以不能靠往
 * 会话 PTY 里发 \t(那会把字符写进真实的 readline 行缓冲)。改为:起一个
 * 一次性的辅助 bash 进程,在会话当前 cwd 下调用 bash-completion / compgen 计算候选:
 *   - 命令位(行首/;|&({ 之后):compgen -c
 *   - 可编程补全位(子命令、参数、选项、分支名等):加载 bash-completion 规范函数
 *   - 路径/文件兜底位:compgen -f / -d
 * 辅助进程非交互、不加载 rc,不污染会话历史与输出。
 */

import { execFile } from 'node:child_process'

const TIMEOUT_MS = 1200
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

export interface CompletionResult {
  items: string[]
  /** items 中是目录的集合(用于前端决定补 '/' 还是 ' ') */
  dirs: Set<string>
}

const BASH_COMPLETION_ENGINE = `
if [ -f /usr/share/bash-completion/bash_completion ]; then
  . /usr/share/bash-completion/bash_completion 2>/dev/null || true
elif [ -f /etc/bash_completion ]; then
  . /etc/bash_completion 2>/dev/null || true
fi

line="$1"
cursor="\${2:-\${#line}}"

export COMP_LINE="$line"
export COMP_POINT="$cursor"
export COMP_KEY=9
export COMP_TYPE=9

prefix="\${line:0:cursor}"

COMP_WORDS=()
temp="$prefix"
while [[ "$temp" =~ ^([[:space:]]*)([^[:space:]]+)(.*)$ ]]; do
  COMP_WORDS+=("\${BASH_REMATCH[2]}")
  temp="\${BASH_REMATCH[3]}"
done
if [[ "$prefix" =~ [[:space:]]$ ]] || [[ \${#COMP_WORDS[@]} -eq 0 ]]; then
  COMP_WORDS+=("")
fi

COMP_CWORD=$((\${#COMP_WORDS[@]} - 1))
cur="\${COMP_WORDS[COMP_CWORD]}"
if [[ $COMP_CWORD -gt 0 ]]; then
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
else
  prev=""
fi

COMPREPLY=()
cmd="\${COMP_WORDS[0]}"

if [[ -z "$cmd" || $COMP_CWORD -eq 0 ]]; then
  if [[ -n "$cur" ]]; then
    COMPREPLY=( $(compgen -c -- "$cur" 2>/dev/null | sort -u | head -n ${MAX_ITEMS}) )
  fi
else
  # 1. 尝试调用 bash 可编程补全规范 (Programmable Completion)
  _completion_loader "$cmd" 2>/dev/null || true
  spec=$(complete -p "$cmd" 2>/dev/null || true)
  
  if [[ -n "$spec" ]]; then
    if [[ "$spec" =~ -F[[:space:]]+([^ ]+) ]]; then
      func="\${BASH_REMATCH[1]}"
      if declare -F "$func" >/dev/null 2>&1; then
        "$func" "$cmd" "$cur" "$prev" 2>/dev/null || true
      fi
    elif [[ "$spec" =~ -W[[:space:]]+\\x27([^\\x27]+)\\x27 || "$spec" =~ -W[[:space:]]+([^ ]+) ]]; then
      wordlist="\${BASH_REMATCH[1]}"
      COMPREPLY=( $(compgen -W "$wordlist" -- "$cur" 2>/dev/null) )
    fi
  fi
  
  # 2. 如果是 sudo / env 穿透命令且未由 _sudo 完成,尝试对后置真实命令补全
  if [[ \${#COMPREPLY[@]} -eq 0 && "$cmd" =~ ^(sudo|env|nohup|time|exec)$ && $COMP_CWORD -ge 2 ]]; then
    real_cmd="\${COMP_WORDS[1]}"
    _completion_loader "$real_cmd" 2>/dev/null || true
    spec=$(complete -p "$real_cmd" 2>/dev/null || true)
    if [[ -n "$spec" && "$spec" =~ -F[[:space:]]+([^ ]+) ]]; then
      func="\${BASH_REMATCH[1]}"
      if declare -F "$func" >/dev/null 2>&1; then
        "$func" "$real_cmd" "$cur" "$prev" 2>/dev/null || true
      fi
    fi
  fi
  
  # 3. 兜底文件或目录补全
  if [[ \${#COMPREPLY[@]} -eq 0 ]]; then
    if [[ "$cmd" =~ ^(cd|pushd|rmdir)$ ]]; then
      COMPREPLY=( $(compgen -d -- "$cur" 2>/dev/null) )
    else
      COMPREPLY=( $(compgen -f -- "$cur" 2>/dev/null) )
    fi
  fi
fi

for item in "\${COMPREPLY[@]}"; do
  [[ -z "$item" ]] && continue
  printf "%s\\n" "$item"
done

printf "\\x1e\\n"

for item in "\${COMPREPLY[@]}"; do
  [[ -z "$item" ]] && continue
  if [[ -d "$item" ]]; then
    printf "%s\\n" "$item"
  fi
done
`

export function computeCompletions(
  text: string,
  cursor: number,
  cwd: string,
): Promise<CompletionResult & WordContext> {
  const ctx = wordContextAt(text, cursor)

  return new Promise((resolve) => {
    execFile(
      'bash',
      ['-c', BASH_COMPLETION_ENGINE, '--', text, String(cursor)],
      { cwd, timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        const items = new Set<string>()
        const dirs = new Set<string>()
        if (!err && stdout) {
          const parts = stdout.split('\x1e\n')
          for (const line of parts[0].split('\n')) {
            const trimmed = line.trim()
            if (trimmed) items.add(trimmed)
          }
          if (parts.length > 1) {
            for (const line of parts[1].split('\n')) {
              const trimmed = line.trim()
              if (trimmed) {
                dirs.add(trimmed)
                items.add(trimmed)
              }
            }
          }
        }
        const list = [...items].slice(0, MAX_ITEMS)
        resolve({ items: list, dirs, ...ctx })
      },
    )
  })
}
