// apps/ws-server/src/ws/redis-adapter.ts
// Minimal no-op Redis adapter scaffold for future horizontal scaling.
// In production, implement pub/sub to broadcast Yjs update messages across instances.

export type MessageHandler = (channel: string, payload: Buffer) => void

export type RedisAdapter = {
  publish: (channel: string, payload: Buffer) => Promise<void>
  subscribe: (channel: string, handler: MessageHandler) => Promise<void>
  unsubscribe: (channel: string, handler: MessageHandler) => Promise<void>
  disconnect: () => Promise<void>
}

export function createNoopRedisAdapter(): RedisAdapter {
  const handlers = new Map<string, Set<MessageHandler>>()

  return {
    async publish(channel: string, payload: Buffer) {
      const set = handlers.get(channel)
      if (!set) return
      for (const h of set) {
        try {
          h(channel, payload)
        } catch {
          // ignore handler errors
        }
      }
    },
    async subscribe(channel: string, handler: MessageHandler) {
      const set = handlers.get(channel) ?? new Set<MessageHandler>()
      set.add(handler)
      handlers.set(channel, set)
    },
    async unsubscribe(channel: string, handler: MessageHandler) {
      const set = handlers.get(channel)
      if (!set) return
      set.delete(handler)
      if (set.size === 0) handlers.delete(channel)
    },
    async disconnect() {
      handlers.clear()
    },
  }
}

// Example usage:
// const bus = createNoopRedisAdapter()
// await bus.subscribe('yjs:updates', (ch, buf) => { /* handle update */ })
// await bus.publish('yjs:updates', Buffer.from([1,2,3]))


