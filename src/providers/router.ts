import micromatch from 'micromatch'
import type { InferenceProvider } from './interface.js'
import { ProviderRegistry } from './registry.js'

export type ResolveResult = {
  provider: InferenceProvider
  method: 'override' | 'routing' | 'default'
  rulePattern?: string
}

export class ProviderRouter {
  constructor(private registry: ProviderRegistry) {}

  resolve(model: string, override?: string): ResolveResult | null {
    if (override) {
      const provider = this.registry.getProvider(override)
      if (provider) return { provider, method: 'override' }
      return null
    }

    for (const route of this.registry.getRoutes()) {
      if (micromatch.isMatch(model, route.pattern)) {
        const provider = this.registry.getProvider(route.provider)
        if (provider) return { provider, method: 'routing', rulePattern: route.pattern }
      }
    }

    const defaultProvider = this.registry.getDefaultProvider()
    if (defaultProvider) return { provider: defaultProvider, method: 'default' }

    return null
  }
}
