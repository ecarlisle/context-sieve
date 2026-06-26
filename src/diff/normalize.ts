import type { ChatMessage } from '../types/index.js'
import type { MessageRef } from './types.js'
import { estimateTokens } from '../metrics/index.js'

export function simpleHash(content: string): string {
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash) + content.charCodeAt(i)
    hash |= 0
  }
  return (hash >>> 0).toString(16)
}

export function normalizeMessage(msg: ChatMessage, index?: number): MessageRef {
  return {
    id: index !== undefined ? `msg-${index}` : `msg-${simpleHash(msg.content).slice(0, 8)}`,
    role: msg.role,
    content: msg.content,
    contentHash: simpleHash(msg.content),
    tokenEstimate: estimateTokens(msg.content),
  }
}

export function normalizeMessages(msgs: ChatMessage[]): MessageRef[] {
  return msgs.map((m, i) => normalizeMessage(m, i))
}
