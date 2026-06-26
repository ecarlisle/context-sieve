export type ProviderMetrics = {
  providerId: string
  model: string
  latencyMs: number
  retries: number
  requestCount: number
}

export type ProviderTestResult = {
  providerId: string
  reachable: boolean
  authConfigured: boolean
  latencyMs: number | null
  error?: string
}

export type ProviderRoute = {
  pattern: string
  provider: string
}
