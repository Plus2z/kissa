/**
 * Kissa · 桌面版主进程。
 *
 * 结构:Electron 主进程 = 外壳;Fastify 服务作为子进程跑在随机本地端口,
 * 窗口加载该地址。服务进程用 Electron 自带的 Node 运行(ELECTRON_RUN_AS_NODE),
 * 因此打包后的应用不依赖系统 Node——只依赖 python3(PTY 桥)和 bash。
 *
 * 前端、真相层、标注层代码与 Web 版完全同一份,零改动。
 */

import { app, BrowserWindow, shell } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer as netServer, connect as netConnect } from 'node:net'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

// 打包后(rpm 等)资源解包在 process.resourcesPath;开发时用仓库相对路径
const SERVER_ENTRY = app.isPackaged
  ? join(process.resourcesPath, 'server/dist/index.js')
  : join(__dirname, '../../server/dist/index.js')
const APP_ICON = app.isPackaged
  ? join(process.resourcesPath, 'icons/icon-512.png')
  : join(__dirname, '../icons/icon-512.png')

let serverProc: ChildProcess | null = null
let serverPort = 0
const authToken = randomBytes(32).toString('base64url')

/** 领一个空闲端口(先占后释放,交给服务进程使用;竞态窗口极小) */
function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = netServer()
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number }
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}

function startServer(port: number): void {
  serverProc = spawn(process.execPath, [SERVER_ENTRY], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(port),
      HOST: '127.0.0.1',
      KISSA_AUTH_TOKEN: authToken,
      LIMINAL_AUTH_TOKEN: authToken,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  serverProc.stdout?.on('data', (d: Buffer) => {
    for (const line of d.toString().split('\n')) {
      if (line.trim()) console.log(`[server] ${line}`)
    }
  })
  serverProc.stderr?.on('data', (d: Buffer) => console.error('[desktop:server]', d.toString().trim()))
  serverProc.on('exit', (code) => {
    console.log(`[desktop] 服务进程退出 (${code})`)
    serverProc = null
  })
}

function waitServerUp(port: number, timeoutMs = 15000): Promise<void> {
  const t0 = Date.now()
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const sock = netConnect({ port, host: '127.0.0.1' }, () => {
        sock.destroy()
        resolve()
      })
      sock.on('error', () => {
        sock.destroy()
        if (Date.now() - t0 > timeoutMs) reject(new Error('服务启动超时'))
        else setTimeout(tryOnce, 200)
      })
    }
    tryOnce()
  })
}

function stopServer(): void {
  if (serverProc && !serverProc.killed) {
    serverProc.kill('SIGTERM')
    // 给 PTY/bash 一点优雅退出的时间,强杀兜底
    const proc = serverProc
    setTimeout(() => {
      try {
        proc.kill('SIGKILL')
      } catch {
        /* 已退出 */
      }
    }, 1500).unref()
  }
  serverProc = null
}

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 640,
    minHeight: 400,
    backgroundColor: '#faf9f9',
    autoHideMenuBar: true,
    title: 'Kissa',
    icon: APP_ICON,
    show: false,
  })
  win.once('ready-to-show', () => win.show())

  // 外部链接交给系统浏览器,不在应用内开新窗
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  await win.loadURL(`http://127.0.0.1:${serverPort}/?token=${encodeURIComponent(authToken)}`)
}

app.setName('Kissa')
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(async () => {
    try {
      serverPort = await pickFreePort()
      startServer(serverPort)
      await waitServerUp(serverPort)
      await createWindow()
    } catch (err) {
      console.error('[desktop] 启动失败:', err)
      app.quit()
    }
  })

  app.on('window-all-closed', () => {
    stopServer()
    app.quit()
  })

  app.on('before-quit', stopServer)
}
