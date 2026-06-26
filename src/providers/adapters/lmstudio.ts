import type { InferenceProvider, ProviderConfig } from '../interface.js'
import { buildPayload, doFetch, parseResponse, validateConnectivity } from './shared.js'

export function createLMStudioProvider(config: ProviderConfig): InferenceProvider {
  const baseUrl = config.baseUrl ?? 'http://localhost:1234'
  const lmHeaders: Record<string, string> = { 'Content-Type': 'application/json' }

  return {
    id: 'lmstudio',
    async chat(request) {
      const body = buildPayload(request)
      const { elapsed, json } = await doFetch(baseUrl, body, lmHeaders)
      return parseResponse(json, elapsed)
    },
    validate: () => validateConnectivity(baseUrl, lmHeaders, '/v1/models', 'lmstudio'),
  }
}
