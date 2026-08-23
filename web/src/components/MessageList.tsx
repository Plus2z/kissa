import { useEffect, useRef } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { useStore } from '../store'
import { CommandBubble } from './CommandBubble'
import { OutputBubble } from './OutputBubble'
import { SystemBubble } from './SystemBubble'

export function MessageList() {
  const messages = useStore((s) => s.messages)
  const virtuosoRef = useRef<VirtuosoHandle>(null)

  useEffect(() => {
    virtuosoRef.current?.scrollToIndex({ index: messages.length - 1, behavior: 'auto' })
  }, [messages.length])

  return (
    <div className="min-h-0 flex-1 bg-canvas">
      <Virtuoso
        ref={virtuosoRef}
        data={messages}
        initialTopMostItemIndex={Math.max(0, messages.length - 1)}
        followOutput={'auto'}
        itemContent={(_i, msg) => {
          if (msg.kind === 'command') return <CommandBubble key={msg.id} msg={msg} />
          if (msg.kind === 'output') return <OutputBubble key={msg.id} msg={msg} />
          return <SystemBubble key={msg.id} msg={msg} />
        }}
        style={{ height: '100%' }}
      />
    </div>
  )
}
