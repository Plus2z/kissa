/**
 * WebSocket 客户端:断线自动重连(指数退避)+ 状态回调。
 * 阶段一每条连接即一个新会话(无持久化,断线后会话重建)。
 */

import type { ClientMessage, ServerMessage } from './protocol'
import { websocketPath } from './auth'

export type ConnStatus = 'connecting' | 'ready' | 'closed'

export class WsClient {
  private ws: WebSocket | null = null
  private backoff = 1000
  private closedByUser = false

  constructor(
    private onMessage: (msg: ServerMessage) => void,
    private onStatus: (status: ConnStatus) => void,
    /** 连接建立后立即调用(用于发送 attach) */
    private onOpen: () => void,
  ) {}

  connect(): void {
    this.closedByUser = false
    this.onStatus('connecting')
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${proto}//${location.host}${websocketPath()}`)
    this.ws = ws

    ws.onopen = () => {
      this.backoff = 1000
      this.onOpen()
    }
    ws.onmessage = (ev) => {
      try {
        this.onMessage(JSON.parse(ev.data as string) as ServerMessage)
      } catch {
        /* 非 JSON 帧忽略 */
      }
    }
    ws.onclose = () => {
      if (this.ws !== ws) return
      if (this.closedByUser) {
        this.onStatus('closed')
        return
      }
      this.onStatus('closed')
      setTimeout(() => this.connect(), this.backoff)
      this.backoff = Math.min(this.backoff * 2, 10_000)
    }
    ws.onerror = () => {
      /* onclose 会跟着触发,重连逻辑在那里 */
    }
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  dispose(): void {
    this.closedByUser = true
    this.ws?.close()
  }

  /** 切换会话时关闭旧连接，但保留服务端会话以便随时切回。 */
  restart(): void {
    this.closedByUser = true
    const previous = this.ws
    this.ws = null
    previous?.close()
    this.connect()
  }
}
