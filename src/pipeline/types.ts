import type { ChatCompletionRequest, ChatCompletionResponse } from '../types/index.js'
import type { Config } from '../config/index.js'

export interface StageDecision {
  eligible: boolean
  intent: 'collect' | 'measure' | 'budget' | 'prune' | 'summarize' | 'dedupe' | 'compress' | 'retrieve' | 'forward'
  confidence: number
  pruneAnalysis?: {
    candidates: number
    removable: number
    confidence: number
  }
}

export interface StageResult {
  stage: string
  status: 'ok' | 'noop' | 'error'
  decision?: StageDecision
  meta?: Record<string, unknown>
}

export interface RequestMetrics {
  estimatedInputTokens: number
  estimatedOutputTokens: number
  startTime: number
  endTime?: number
}

export interface PipelineContext {
  request: ChatCompletionRequest
  response?: ChatCompletionResponse
  metrics: RequestMetrics
  config: Config
  state: Map<string, unknown>
}

export interface PipelineStage {
  name: string
  run(ctx: PipelineContext): Promise<StageResult>
}

export interface PipelineRunResult {
  ctx: PipelineContext
  trace: StageResult[]
}
