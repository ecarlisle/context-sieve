import type { InferenceProvider, ProviderConfig } from '../interface.js'
import type { ChatCompletionRequest, ChatCompletionResponse } from '../../types/index.js'
import type { ProviderTestResult } from '../types.js'

export function createOllamaProvider(config: ProviderConfig): InferenceProvider {
  const baseUrl = config.baseUrl ?? 'http://localhost:11434'

  return {
    id: 'ollama',
    async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
      const body: Record<string, unknown> = {
        model: request.model,
        messages: request.messages.map(m => ({ role: m.role, content: m.content })),
        stream: false,
      }
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Ollama HTTP ${res.status}: ${text}`)
      }
      const json = await res.json() as Record<string, unknown>
      const message = json.message as Record<string, unknown> | undefined
      const content = (message?.content as string) ?? ''
      return {
        id: `ollama-${Date.now()}`,
        content,
        outputTokenEstimate: content.length / 4,
        inputTokenEstimate: 0,
        delta: 0,
      }
    },
    async validate(): Promise<ProviderTestResult> {
      const start = Date.now()
      try {
        const res = await fetch(`${baseUrl}/api/tags`, { method: 'GET', headers: { 'Content-Type': 'application/json' } })
        const latencyMs = Date.now() - start
        if (res.ok) {
          return { providerId: 'ollama', reachable: true, authConfigured: false, latencyMs }
        }
        return { providerId: 'ollama', reachable: false, authConfigured: false, latencyMs, error: `HTTP ${res.status}` }
      } catch (err) {
        const latencyMs = Date.now() - start
        return { providerId: 'ollama', reachable: false, authConfigured: false, latencyMs, error: String(err) }
      }
    },
  }
}
