import type { InferenceProvider } from './interface.js'
import type { ChatCompletionRequest, ChatCompletionResponse } from '../types/index.js'
import type { ProviderTestResult } from './types.js'
import { estimateTokens } from '../metrics/index.js'

const MOCK_RESPONSE = 'This is a mock response from context-sieve.'
const MIN_LATENCY = 50
const MAX_LATENCY = 150

export class MockProvider implements InferenceProvider {
  readonly id = 'mock'

  async chat(_request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const latency = Math.floor(Math.random() * (MAX_LATENCY - MIN_LATENCY + 1)) + MIN_LATENCY
    await new Promise(resolve => setTimeout(resolve, latency))

    const output = estimateTokens(MOCK_RESPONSE)

    return {
      id: `cmpl-${Date.now()}`,
      content: MOCK_RESPONSE,
      outputTokenEstimate: output,
      inputTokenEstimate: 0,
      delta: 0,
    }
  }

  async validate(): Promise<ProviderTestResult> {
    return {
      providerId: 'mock',
      reachable: true,
      authConfigured: true,
      latencyMs: 0,
    }
  }
}
