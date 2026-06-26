import type { ChatCompletionRequest, ChatCompletionResponse } from '../types/index.js'
import type { ProviderTestResult } from './types.js'

export interface InferenceProvider {
  id: string
  chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse>
  validate(): Promise<ProviderTestResult>
}

export type ProviderConfig = {
  baseUrl?: string
  apiKey?: string
  defaultModel?: string
}

export type ProviderAdapterFactory = (config: ProviderConfig) => InferenceProvider
