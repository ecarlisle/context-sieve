import type { InferenceProvider, ProviderConfig } from '../interface.js'
import { buildHeaders, buildPayload, doFetch, parseResponse, validateConnectivity } from './shared.js'

export function createOpenRouterProvider(config: ProviderConfig): InferenceProvider {
  const baseUrl = config.baseUrl ?? 'https://openrouter.ai/api'
  const headers: Record<string, string> = {
    ...buildHeaders(config),
    ...(config.apiKey ? { 'HTTP-Referer': 'https://context-sieve.local' } : {}),
  }

  return {
    id: 'openrouter',
    async chat(request) {
      const body = buildPayload(request)
      const { elapsed, json } = await doFetch(baseUrl, body, headers)
      return parseResponse(json, elapsed)
    },
    validate: () => validateConnectivity(baseUrl, headers, '/v1/models', 'openrouter'),
  }
}
