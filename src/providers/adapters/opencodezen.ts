import type { InferenceProvider, ProviderConfig } from '../interface.js'
import { buildHeaders, buildPayload, doFetch, parseResponse, validateConnectivity } from './shared.js'

export function createOpenCodeZenProvider(config: ProviderConfig): InferenceProvider {
  const baseUrl = config.baseUrl ?? 'https://zen.opencode.ai'
  const headers: Record<string, string> = { ...buildHeaders(config) }

  return {
    id: 'opencodezen',
    async chat(request) {
      const body = buildPayload(request)
      const { elapsed, json } = await doFetch(baseUrl, body, headers)
      return parseResponse(json, elapsed)
    },
    validate: () => validateConnectivity(baseUrl, headers, '/v1/models', 'opencodezen'),
  }
}
