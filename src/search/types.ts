export type SearchQuery = {
  text?: string
  runId?: string
  author?: string
  annotationType?: 'note' | 'question' | 'issue' | 'insight' | 'decision'
  stage?: string
  hasSummary?: boolean
  hasDiff?: boolean
  hasCausal?: boolean
  minConfidence?: number
}

export type SearchResult = {
  runId: string
  matches: Array<{
    source: 'annotation' | 'snapshot' | 'timeline' | 'causal'
    reason: string
  }>
}

export type IndexEntry = {
  runId: string
  model: string
  inputTokens: number
  outputTokens: number
  timestamp: number
  stageNames: string[]
  hasSummary: boolean
  summaryConfidence: number | undefined
  hasPrune: boolean
  annotationTypes: string[]
  annotationAuthors: string[]
  annotationTexts: string[]
  hasDiff: boolean
  hasCausal: boolean
  compressionRatio: number | undefined
  replayId: string | undefined
}
