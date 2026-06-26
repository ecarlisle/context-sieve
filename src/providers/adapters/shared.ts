import type { ProviderConfig } from '../interface.js'
import type { ChatCompletionRequest, ChatCompletionResponse } from '../../types/index.js'
import type { ProviderTestResult } from '../types.js'

export function buildHeaders(config: ProviderConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`
  }
  return headers
}

export function buildPayload(request: ChatCompletionRequest): Record<string, unknown> {
  return {
    model: request.model,
    messages: request.messages.map(m => ({ role: m.role, content: m.content })),
    ...(request.max_tokens !== undefined && { max_tokens: request.max_tokens }),
    ...(request.temperature !== undefined && { temperature: request.temperature }),
    ...(request.stream !== undefined && { stream: request.stream }),
  }
}

export async function doFetch(baseUrl: string, body: Record<string, unknown>, headers: Record<string, string>): Promise<{ elapsed: number; json: Record<string, unknown> }> {
  const start = Date.now()
  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const elapsed = Date.now() - start
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  const json = await res.json() as Record<string, unknown>
  return { elapsed, json }
}

export async function validateConnectivity(
  baseUrl: string,
  headers: Record<string, string>,
  endpoint: string,
  providerId: string,
): Promise<ProviderTestResult> {
  const start = Date.now()
  try {
    const res = await fetch(`${baseUrl}${endpoint}`, { method: 'GET', headers })
    const latencyMs = Date.now() - start
    if (res.ok) {
      return { providerId, reachable: true, authConfigured: !!headers['Authorization'] || !!headers['x-api-key'], latencyMs }
    }
    if (res.status === 401 || res.status === 403) {
      return { providerId, reachable: true, authConfigured: false, latencyMs, error: `HTTP ${res.status}: authentication failed` }
    }
    return { providerId, reachable: false, authConfigured: !!headers['Authorization'] || !!headers['x-api-key'], latencyMs, error: `HTTP ${res.status}` }
  } catch (err) {
    const latencyMs = Date.now() - start
    return { providerId, reachable: false, authConfigured: !!headers['Authorization'] || !!headers['x-api-key'], latencyMs, error: String(err) }
  }
}

export function parseResponse(json: Record<string, unknown>, _elapsed: number): ChatCompletionResponse {
  const choice = (json.choices as Array<Record<string, unknown>>)?.[0]
  const message = choice?.message as Record<string, unknown> | undefined
  const content = (message?.content as string) ?? ''
  const usage = json.usage as Record<string, number> | undefined
  return {
    id: (json.id as string) ?? `resp-${Date.now()}`,
    content,
    outputTokenEstimate: usage?.completion_tokens ?? content.length / 4,
    inputTokenEstimate: usage?.prompt_tokens ?? 0,
    delta: (usage?.total_tokens ?? 0) - (usage?.prompt_tokens ?? 0),
  }
}
