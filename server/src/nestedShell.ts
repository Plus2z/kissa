/**
 * 嵌套 Shell 与远程环境命令边界辅助模块。
 *
 * 覆盖场景:
 * 1. 嵌套 Shell 命令触发规则: ssh / mosh / sudo -i / sudo -s / su - / docker exec -it / kubectl exec -it
 * 2. 第一级 OSC 133 注入脚本构建 (Bash / Zsh / Fish)
 * 3. 第二级 哨兵 Prompt 注入语句生成与正则解析
 */

import { randomBytes } from 'node:crypto'
import { parseSshTarget, type SshTarget } from './ssh.js'

export interface NestedShellInfo {
  type: 'ssh' | 'mosh' | 'sudo' | 'su' | 'docker' | 'kubectl' | 'generic'
  targetName: string
  rawCommand: string
  sshTarget?: SshTarget
}

/** 识别命令行是否为进入嵌套 Shell 的交互式命令 */
export function parseNestedShellCommand(cmdline: string): NestedShellInfo | null {
  const trimmed = cmdline.trim()
  if (!trimmed) return null

  // 1. SSH 目标识别
  const sshTarget = parseSshTarget(trimmed)
  if (sshTarget) {
    const targetName = sshTarget.user ? `${sshTarget.user}@${sshTarget.host}` : sshTarget.host
    return {
      type: 'ssh',
      targetName,
      rawCommand: trimmed,
      sshTarget,
    }
  }

  const tokens = trimmed.split(/\s+/)
  const prog = tokens[0]?.toLowerCase()

  // 2. Mosh 识别
  if (prog === 'mosh') {
    const target = tokens.slice(1).find((t) => !t.startsWith('-')) || 'mosh-host'
    return {
      type: 'mosh',
      targetName: `mosh:${target}`,
      rawCommand: trimmed,
    }
  }

  // 3. Sudo / Su 进入交互式 root shell
  if (prog === 'sudo') {
    if (tokens.includes('-i') || tokens.includes('-s') || tokens.includes('su') || tokens.includes('bash') || tokens.includes('zsh') || tokens.includes('sh')) {
      const userIdx = tokens.indexOf('-u')
      const targetUser = userIdx >= 0 && tokens[userIdx + 1] ? tokens[userIdx + 1] : 'root'
      return {
        type: 'sudo',
        targetName: `sudo(${targetUser})`,
        rawCommand: trimmed,
      }
    }
  }

  if (prog === 'su') {
    const targetUser = tokens.find((t) => t !== 'su' && !t.startsWith('-')) || 'root'
    return {
      type: 'su',
      targetName: `su(${targetUser})`,
      rawCommand: trimmed,
    }
  }

  // 4. Docker / Podman / Kubectl exec -it
  if (prog === 'docker' || prog === 'podman') {
    const execIdx = tokens.indexOf('exec')
    if (execIdx >= 0 && tokens.some((t) => t.includes('-i') || t.includes('-it') || t.includes('-ti'))) {
      const container = tokens.slice(execIdx + 1).find((t) => !t.startsWith('-')) || 'container'
      return {
        type: 'docker',
        targetName: `docker:${container}`,
        rawCommand: trimmed,
      }
    }
  }

  if (prog === 'kubectl') {
    const execIdx = tokens.indexOf('exec')
    if (execIdx >= 0 && tokens.some((t) => t.includes('-i') || t.includes('-it') || t.includes('-ti'))) {
      const pod = tokens.slice(execIdx + 1).find((t) => !t.startsWith('-') && t !== '--') || 'pod'
      return {
        type: 'kubectl',
        targetName: `k8s:${pod}`,
        rawCommand: trimmed,
      }
    }
  }

  return null
}

/** 生成一次性哨兵 Token (如 '9f3a1c') */
export function generateSentinelToken(): string {
  return randomBytes(3).toString('hex')
}

/**
 * 第二级方案: 哨兵 Prompt 注入语句。
 * 针对 bash / zsh / sh / dash / busybox 设定统一标记 @@CTI_<token>_$?@@。
 *
 * ⚠️ 不包含 Fish 分支：Fish 不支持 POSIX if-elif-fi 语法，因此该分支在 Fish
 * 中根本不会被执行；反而 `function fish_prompt; ...; end` 是 Fish 专有语法，
 * 在 Bash/Zsh 中会造成语法错误，导致整条注入失败。Fish 远程会话暂不支持哨兵模式。
 */
export function buildSentinelInjection(token: string): string {
  const marker = `@@CTI_${token}_$?@@`
  // zsh: 启用 PROMPT_SUBST 并设置 PROMPT（$? 在提示符展开时求值）
  // bash/sh/dash/busybox: 设置 PS1（$? 在提示符展开时求值）
  return `if [ -n "$ZSH_VERSION" ]; then setopt PROMPT_SUBST 2>/dev/null; PROMPT=$'\\n${marker}\\n'; else export PS1='\\n${marker}\\n'; fi`
}

/** 极简 shell (如 dash/busybox sh) 无法动态求值 PS1 时的命令透明后缀包装 */
export function wrapCommandWithSentinel(cmd: string, token: string): string {
  const trimmed = cmd.trim()
  if (!trimmed) return cmd
  // 避免对 exit / logout 等内部控制指令做包装
  if (trimmed === 'exit' || trimmed === 'logout') return cmd
  return `${trimmed}; printf '\\n@@CTI_${token}_%s@@\\n' "$?"`
}

/** 哨兵标记正则创建 */
export function createSentinelMatcher(token: string): RegExp {
  return new RegExp(`(?:\\r|\\n|^)@@CTI_${token}_(-?\\d+)@@(?:\\r|\\n|$)`)
}
