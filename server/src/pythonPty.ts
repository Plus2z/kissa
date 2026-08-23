/**
 * Python PTY 桥的 Node 侧适配层,接口对齐 node-pty(IPty 的最小子集):
 * spawn / onData / onExit / write / resize / kill。
 *
 * 为什么不用 node-pty:当前机器没有 g++(gcc-c++ 未安装,且无 sudo),
 * node-pty 需要原生编译。Python 标准库的 pty + fcntl.ioctl(TIOCSWINSZ)
 * 能提供完全等价的真 PTY 语义。装好编译工具链后,把本文件的实现换回
 * node-pty 即可,sessions.ts 不用动。
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'

const BRIDGE_PATH = join(dirname(fileURLToPath(import.meta.url)), '../bin/pty_bridge.py')

export interface SpawnOptions {
  cols: number
  rows: number
  cwd?: string
  env?: Record<string, string>
}

export class PythonPty {
  private child: ChildProcessWithoutNullStreams
  private exitReported = false

  constructor(
    file: string,
    args: string[],
    opts: SpawnOptions,
    handlers: {
      onData: (data: string) => void
      onExit: (exitCode: number | null) => void
    },
  ) {
    this.child = spawn('python3', [BRIDGE_PATH, file, ...args], {
      stdio: ['pipe', 'pipe', 'pipe', 'pipe'], // fd 3 = 控制通道
      cwd: opts.cwd,
      env: {
        ...process.env,
        ...opts.env,
        TC_COLS: String(opts.cols),
        TC_ROWS: String(opts.rows),
        TC_CWD: opts.cwd ?? '',
      },
    }) as ChildProcessWithoutNullStreams

    this.child.stdout.setEncoding('utf8')
    this.child.stdout.on('data', handlers.onData)

    // stderr 上是 JSON 行事件(exit code)
    const rl = createInterface({ input: this.child.stderr })
    rl.on('line', (line: string) => {
      try {
        const ev = JSON.parse(line) as { exit?: number }
        if (typeof ev.exit === 'number') {
          this.exitReported = true
          handlers.onExit(ev.exit >= 0 ? ev.exit : null)
        }
      } catch {
        /* 非 JSON 的杂音忽略 */
      }
    })
    this.child.on('error', (err) => {
      if (!this.exitReported) {
        this.exitReported = true
        handlers.onExit(null)
      }
      throw err
    })
  }

  write(data: string): void {
    this.child.stdin.write(data, 'utf8')
  }

  resize(cols: number, rows: number): void {
    const ctrl = this.child.stdio[3] as import('node:stream').Writable | null
    ctrl?.write(JSON.stringify({ cols, rows }) + '\n')
  }

  kill(): void {
    try {
      this.child.kill('SIGTERM')
    } catch {
      /* 已退出 */
    }
  }
}
