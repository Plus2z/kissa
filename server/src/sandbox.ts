import { existsSync } from 'node:fs'

export type SandboxMode = 'none' | 'bwrap'

export function sandboxModeFromEnv(): SandboxMode {
  const mode = process.env.LIMINAL_SANDBOX ?? 'none'
  if (mode === 'none' || mode === 'bwrap') return mode
  throw new Error('LIMINAL_SANDBOX 仅支持 none 或 bwrap')
}

export function bwrapAvailable(): boolean {
  return ['/usr/bin/bwrap', '/bin/bwrap'].some((path) => existsSync(path))
}

function bwrapPath(): string {
  return ['/usr/bin/bwrap', '/bin/bwrap'].find((path) => existsSync(path)) ?? '/usr/bin/bwrap'
}

/**
 * Bubblewrap 将宿主根目录只读挂载，只向会话工作目录和临时目录开放写入，
 * 同时禁用网络与新的命名空间外资源。该模式需显式由环境变量启用。
 */
export function sandboxCommand(
  mode: SandboxMode,
  shell: string,
  shellArgs: string[],
  workspace: string,
  runtimeDir: string,
): { file: string; args: string[] } {
  if (mode === 'none') return { file: shell, args: shellArgs }
  if (!bwrapAvailable()) throw new Error('已请求 bwrap 沙箱，但系统未安装 bwrap')

  return {
    file: bwrapPath(),
    args: [
      '--die-with-parent',
      '--unshare-all',
      '--as-pid-1',
      '--ro-bind', '/', '/',
      '--dev', '/dev',
      '--proc', '/proc',
      '--tmpfs', '/tmp',
      '--bind', workspace, workspace,
      '--bind', runtimeDir, runtimeDir,
      '--setenv', 'HOME', runtimeDir,
      '--setenv', 'TMPDIR', '/tmp',
      '--chdir', workspace,
      shell,
      ...shellArgs,
    ],
  }
}
