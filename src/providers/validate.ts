import { ProviderRegistry } from './registry.js'

export type ValidationReport = {
  providerId: string
  reachable: boolean
  authConfigured: boolean
  latencyMs: number | null
  error?: string
}

export async function validateProvider(registry: ProviderRegistry, id: string): Promise<ValidationReport | null> {
  return registry.validateProvider(id)
}

export async function validateAllProviders(registry: ProviderRegistry): Promise<ValidationReport[]> {
  return registry.validateAll()
}

export function printValidationResults(results: ValidationReport[]): string[] {
  return results.map(r => {
    const status = r.reachable ? (r.authConfigured ? '✓' : '⚠') : '✗'
    const line = `${status} ${r.providerId}`
    if (!r.reachable) return `${line} (offline${r.error ? `: ${r.error}` : ''})`
    if (!r.authConfigured) return `${line} (no auth configured)`
    return `${line} (${r.latencyMs ?? '?'}ms)`
  })
}
