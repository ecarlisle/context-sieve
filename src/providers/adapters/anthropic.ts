import type { InferenceProvider, ProviderConfig } from '../interface.js'
import type { ChatCompletionRequest, ChatCompletionResponse } from '../../types/index.js'
import type { ProviderTestResult } from '../types.js'

export function createAnthropicProvider(config: ProviderConfig): InferenceProvider {
  const baseUrl = config.baseUrl ?? 'https://api.anthropic.com'
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': config.apiKey ?? '',
    'anthropic-version': '2023-06-01',
  }

  return {
    id: 'anthropic',
    async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
      const body: Record<string, unknown> = {
        model: request.model,
        max_tokens: request.max_tokens ?? 1024,
        messages: request.messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
      }
      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Anthropic HTTP ${res.status}: ${text}`)
      }
      const json = await res.json() as Record<string, unknown>
      const content = ((json.content as Array<Record<string, unknown>>)?.[0]?.text as string) ?? ''
      const usage = json.usage as Record<string, number> | undefined
      return {
        id: (json.id as string) ?? `resp-${Date.now()}`,
        content,
        outputTokenEstimate: usage?.output_tokens ?? content.length / 4,
        inputTokenEstimate: usage?.input_tokens ?? 0,
        delta: 0,
      }
    },
    async validate(): Promise<ProviderTestResult> {
      const start = Date.now()
      try {
        const res = await fetch(`${baseUrl}/v1/models`, {
          method: 'GET',
          headers: { 'x-api-key': config.apiKey ?? '', 'anthropic-version': '2023-06-01' },
        })
        const latencyMs = Date.now() - start
        if (res.ok) {
          return { providerId: 'anthropic', reachable: true, authConfigured: !!config.apiKey, latencyMs }
        }
        if (res.status === 401 || res.status === 403) {
          return { providerId: 'anthropic', reachable: true, authConfigured: false, latencyMs, error: `HTTP ${res.status}: authentication failed` }
        }
        return { providerId: 'anthropic', reachable: false, authConfigured: !!config.apiKey, latencyMs, error: `HTTP ${res.status}` }
      } catch (err) {
        const latencyMs = Date.now() - start
        return { providerId: 'anthropic', reachable: false, authConfigured: !!config.apiKey, latencyMs, error: String(err) }
      }
    },
  }
}
