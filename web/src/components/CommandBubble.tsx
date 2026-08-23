import type { ChatMessage } from '../store'
import { useSettings } from '../settings'
import { Avatar } from './Avatar'

function fmtTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 命令气泡 = 微信"发送方"样式:绿底、右对齐、右下小尾巴、用户头像 */
export function CommandBubble({ msg }: { msg: ChatMessage }) {
  const cwdShort = (msg.cwd ?? '').replace(/^\/home\/[^/]+/, '~')
  const userAvatar = useSettings((s) => s.userAvatar)

  return (
    <div className="flex items-end justify-end gap-2.5 px-4 py-1.5">
      <div className="max-w-[75%]">
        <div className="rounded-2xl rounded-br-sm bg-bubble-out px-4 py-2.5 shadow-sm">
          <div className="font-mono-term term-fs text-bubble-out-ink break-all leading-relaxed">
            <span className="mr-1.5 opacity-70">❯</span>
            {msg.text}
          </div>
        </div>
        <div className="mt-1 flex items-center justify-end gap-2 pr-1 text-[11px] text-ink-2">
          {cwdShort && <span className="font-mono-term">{cwdShort}</span>}
          <span>{fmtTime(msg.ts)}</span>
        </div>
      </div>
      <Avatar cfg={userAvatar} kind="user" />
    </div>
  )
}
