import type { ChatMessage } from '../types/index.js'
import type { StageResult } from '../pipeline/types.js'

export type RunSnapshot = {
  id: string
  timestamp: number
  request: {
    model: string
    messages: ChatMessage[]
  }
  response: {
    id: string
    content: string
  }
  metrics: {
    inputTokens: number
    outputTokens: number
    delta: number
  }
  pipelineTrace: StageResult[]
  prune?: {
    removed: Array<{ type: string; content: unknown; reason: string }>
    shadowMode: boolean
    removable: number
    advisoryInfluenceUsed?: boolean
    highestAdvisoryScore?: number
  }
  summaries?: {
    id: string
    keyPoints: string[]
    summary: string
    confidence: number
    sourceCount: number
    sourceIds: string[]
  }
  advisory?: {
    scores: Array<{ messageIndex: number; score: number; reason: string }>
    highestScore?: number
    scoredCount: number
  }
  provider?: {
    id: string
    model: string
    latency: number
  }
  multiRun?: {
    groupId: string
    provider: string
  }
}
