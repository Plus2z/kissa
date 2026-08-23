/**
 * SSH 目标解析(会话身份体系的一部分)。
 *
 * 从命令行识别 `ssh` 的连接目标,用于:
 *   - 会话"终端名":SSH 会话显示目标设备名(需求:终端名取设备名称,SSH 取目标设备)
 *   - 新建 SSH 会话:校验/规范化用户输入
 *   - SSH 历史记录:记录 user@host
 *
 * 解析规则:ssh 语法为 `ssh [选项] 目标 [远程命令…]`——第一个非选项参数即目标,
 * 选项按需解析(-p 端口 / -l 用户 / 带值选项跳值),目标后其余参数为远程命令,忽略。
 */

export interface SshTarget {
  /** 用户名;未指定时为空串 */
  user: string
  host: string
  /** 端口;未指定时为 22 */
  port: number
}

/** 需要跳过下一个 token 的 ssh 选项(带值选项) */
const SSH_VALUE_OPTS = new Set([
  '-J', '-i', '-o', '-F', '-D', '-L', '-R', '-W', '-b', '-c', '-E', '-e',
  '-I', '-m', '-O', '-Q', '-S', '-w', '-l', '-p',
])

/** 从 ssh 命令行解析目标;非 ssh 命令或没有目标时返回 null */
export function parseSshTarget(cmdline: string): SshTarget | null {
  const tokens = cmdline.trim().split(/\s+/)
  if (tokens.length === 0 || tokens[0] !== 'ssh') return null

  let user = ''
  let port = 22
  let target: string | null = null

  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i]!
    if (SSH_VALUE_OPTS.has(t)) {
      if (t === '-p') port = Number(tokens[i + 1]) || 22
      else if (t === '-l') user = tokens[i + 1] ?? ''
      i++ // 跳过选项值
      continue
    }
    if (/^-p\d+$/.test(t)) {
      port = Number(t.slice(2)) || 22
      continue
    }
    if (t.startsWith('-l') && t.length > 2) {
      user = t.slice(2)
      continue
    }
    if (t.startsWith('-')) continue // 无值选项
    target = t // 第一个非选项参数 = 目标;其余为远程命令
    break
  }

  if (!target) return null
  const at = target.lastIndexOf('@')
  if (at >= 0) {
    user = target.slice(0, at) || user
    target = target.slice(at + 1)
  }
  if (!target || target.length === 0) return null
  return { user, host: target, port }
}

/** 展示用:user@host(端口非 22 时附带) */
export function formatSshTarget(t: SshTarget): string {
  const base = t.user ? `${t.user}@${t.host}` : t.host
  return t.port !== 22 ? `${base} -p ${t.port}` : base
}

/** 生成实际执行的 ssh 命令行(新建 SSH 会话时自动执行) */
export function buildSshCommand(t: SshTarget): string {
  const base = t.user ? `${t.user}@${t.host}` : t.host
  return t.port !== 22 ? `ssh -p ${t.port} ${base}` : `ssh ${base}`
}
