import micromatch from 'micromatch'
import type { InferenceProvider, ProviderConfig } from './interface.js'
import { MockProvider } from './mockProvider.js'
import {
  createOpenAIProvider,
  createAnthropicProvider,
  createOpenRouterProvider,
  createOllamaProvider,
  createLMStudioProvider,
  createOpenCodeZenProvider,
} from './adapters/index.js'
import { loadProvidersConfig, loadRoutingConfig, type ProvidersConfig, type RoutingConfig } from './config/loader.js'
import type { ProviderRoute, ProviderTestResult } from './types.js'

export class ProviderRegistry {
  private providers: Map<string, InferenceProvider> = new Map()
  private routes: ProviderRoute[] = []
  private defaultProviderId: string = 'mock'

  constructor(providersConfig?: ProvidersConfig, routingConfig?: RoutingConfig) {
    const pCfg = providersConfig ?? loadProvidersConfig()
    const rCfg = routingConfig ?? loadRoutingConfig()

    this.defaultProviderId = pCfg.default

    for (const [id, cfg] of Object.entries(pCfg.providers)) {
      const provider = this.createAdapter(id, cfg)
      if (provider) {
        this.providers.set(id, provider)
      }
    }

    if (!this.providers.has('mock')) {
      this.providers.set('mock', new MockProvider())
    }

    for (const rule of rCfg.rules) {
      this.routes.push(rule)
    }
  }

  private createAdapter(id: string, config: ProviderConfig): InferenceProvider | null {
    switch (id) {
      case 'mock':
        return new MockProvider()
      case 'openai':
        return createOpenAIProvider(config)
      case 'anthropic':
        return createAnthropicProvider(config)
      case 'openrouter':
        return createOpenRouterProvider(config)
      case 'ollama':
        return createOllamaProvider(config)
      case 'lmstudio':
        return createLMStudioProvider(config)
      case 'opencodezen':
        return createOpenCodeZenProvider(config)
      default:
        return null
    }
  }

  // fallow-ignore-next-line unused-class-member
  register(id: string, provider: InferenceProvider): void {
    this.providers.set(id, provider)
  }

  resolve(model: string, override?: string): InferenceProvider | null {
    if (override) {
      return this.providers.get(override) ?? null
    }

    for (const route of this.routes) {
      if (micromatch.isMatch(model, route.pattern)) {
        const p = this.providers.get(route.provider)
        if (p) return p
      }
    }

    return this.providers.get(this.defaultProviderId) ?? null
  }

  resolveProviderForModel(model: string): string {
    if (this.defaultProviderId && !this.providers.has(this.defaultProviderId)) {
      return 'mock'
    }

    for (const route of this.routes) {
      if (micromatch.isMatch(model, route.pattern)) {
        if (this.providers.has(route.provider)) return route.provider
      }
    }

    return this.defaultProviderId
  }

  // fallow-ignore-next-line unused-class-member
  getDefaultProvider(): InferenceProvider {
    return this.providers.get(this.defaultProviderId) ?? new MockProvider()
  }

  getProvider(id: string): InferenceProvider | undefined {
    return this.providers.get(id)
  }

  listProviders(): Array<{ id: string; configured: boolean; routeCount: number }> {
    return Array.from(this.providers.entries()).map(([id]) => ({
      id,
      configured: true,
      routeCount: this.routes.filter(r => r.provider === id).length,
    }))
  }

  getRoutes(): ProviderRoute[] {
    return [...this.routes]
  }

  async validateProvider(id: string): Promise<ProviderTestResult | null> {
    const provider = this.providers.get(id)
    if (!provider) return null
    return provider.validate()
  }

  async validateAll(): Promise<ProviderTestResult[]> {
    const results: ProviderTestResult[] = []
    for (const [id] of this.providers) {
      const provider = this.providers.get(id)!
      try {
        results.push(await provider.validate())
      } catch (err) {
        results.push({ providerId: id, reachable: false, authConfigured: false, latencyMs: null, error: String(err) })
      }
    }
    return results
  }

  get defaultProvider(): string {
    return this.defaultProviderId
  }
}
