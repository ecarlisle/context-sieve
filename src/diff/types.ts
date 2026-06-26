import type { ChatMessage } from '../types/index.js'
import type { StageResult } from '../pipeline/types.js'
import type { PruneResult } from '../compression/prune.js'
import type { ShadowSummary } from '../compression/summarize.js'

export interface MessageRef {
  id: string
  role: string
  content: string
  contentHash: string
  tokenEstimate: number
}

export interface RunSnapshot {
  requestId: string
  inputMessages: ChatMessage[]
  finalMessages: ChatMessage[]
  trace: StageResult[]
  pruneResult?: PruneResult
  shadowSummary?: ShadowSummary
}

export interface ContextDiff {
  runA: RunSnapshot
  runB: RunSnapshot
  preserved: MessageRef[]
  removed: MessageRef[]
  summarized: MessageRef[]
  unchanged: MessageRef[]
  advisoryOnly: MessageRef[]
}
