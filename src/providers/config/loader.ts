import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import YAML from 'yaml'
import type { ProviderConfig } from '../interface.js'

export type ProvidersConfig = {
  default: string
  providers: Record<string, ProviderConfig>
}

export type RoutingConfig = {
  rules: Array<{ pattern: string; provider: string }>
}

function interpolateEnv(value: string): string {
  return value.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? '')
}

function loadYamlFile(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null
  const raw = readFileSync(path, 'utf-8')
  return YAML.parse(raw) as Record<string, unknown>
}

export function loadProvidersConfig(customPath?: string): ProvidersConfig {
  const path = customPath ?? join(process.cwd(), 'config', 'providers.yaml')
  const data = loadYamlFile(path)

  if (!data || !data.providers) {
    return { default: 'mock', providers: { mock: {} } }
  }

  const providers: Record<string, ProviderConfig> = {}
  for (const [id, cfg] of Object.entries(data.providers as Record<string, unknown>)) {
    const c = cfg as Record<string, string> | undefined
    providers[id] = {
      baseUrl: c?.baseUrl ? interpolateEnv(c.baseUrl) : undefined,
      apiKey: c?.apiKey ? interpolateEnv(c.apiKey) : undefined,
      defaultModel: c?.defaultModel,
    }
  }

  return {
    default: (data.default as string) ?? 'mock',
    providers,
  }
}

export function loadRoutingConfig(customPath?: string): RoutingConfig {
  const path = customPath ?? join(process.cwd(), 'config', 'routing.yaml')
  const data = loadYamlFile(path)

  if (!data || !data.routing) {
    return { rules: [] }
  }

  const routing = data.routing as Record<string, string>
  const rules: Array<{ pattern: string; provider: string }> = []
  for (const [pattern, provider] of Object.entries(routing)) {
    rules.push({ pattern, provider })
  }

  return { rules }
}
