import type { ChatMessage } from '../store'

/** 系统消息 = 微信居中时间胶囊 */
export function SystemBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div className="flex justify-center px-4 py-2">
      <span className="rounded-full bg-ink/10 px-3 py-1 text-[11px] text-ink-2">
        {msg.text}
      </span>
    </div>
  )
}
