export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatCompletionRequest {
  model: string
  messages: ChatMessage[]
  stream?: boolean
  max_tokens?: number
  temperature?: number
  provider?: string
  providers?: string[]
}

export interface ChatCompletionResponse {
  id: string
  content: string
  outputTokenEstimate: number
  inputTokenEstimate: number
  delta: number
  provider?: string
}

export interface ProviderRequest {
  model: string
  messages: ChatMessage[]
  stream?: boolean
  metadata?: {
    runId?: string
    providerHint?: string
  }
}

export interface ProviderResponse {
  content: string
  usage?: {
    inputTokens: number
    outputTokens: number
  }
  raw?: unknown
}
