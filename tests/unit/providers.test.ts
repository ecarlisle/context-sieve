import { describe, it, expect, beforeAll } from 'vitest'
import { ProviderRegistry } from '../../src/providers/registry.js'
import type { ProvidersConfig, RoutingConfig } from '../../src/providers/config/loader.js'

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry
  const providersConfig: ProvidersConfig = {
    default: 'mock',
    providers: {
      mock: {},
    },
  }
  const routingConfig: RoutingConfig = {
    rules: [
      { pattern: 'gpt-4*', provider: 'mock' },
      { pattern: 'claude-*', provider: 'mock' },
    ],
  }

  beforeAll(() => {
    registry = new ProviderRegistry(providersConfig, routingConfig)
  })

  it('resolves a known model via routing rules', () => {
    const provider = registry.resolve('gpt-4o-mini')
    expect(provider).not.toBeNull()
    expect(provider!.id).toBe('mock')
  })

  it('resolves to default provider when no route matches', () => {
    const provider = registry.resolve('unknown-model-123')
    expect(provider).not.toBeNull()
    expect(provider!.id).toBe('mock')
  })

  it('override parameter takes precedence over routing', () => {
    const provider = registry.resolve('gpt-4o', 'mock')
    expect(provider).not.toBeNull()
    expect(provider!.id).toBe('mock')
  })

  it('returns null for unknown override', () => {
    const provider = registry.resolve('gpt-4o', 'nonexistent')
    expect(provider).toBeNull()
  })

  it('getProvider returns a registered provider', () => {
    const provider = registry.getProvider('mock')
    expect(provider).toBeDefined()
    expect(provider!.id).toBe('mock')
  })

  it('getProvider returns undefined for unregistered provider', () => {
    const provider = registry.getProvider('nonexistent')
    expect(provider).toBeUndefined()
  })

  it('listProviders returns all registered providers', () => {
    const providers = registry.listProviders()
    expect(providers.length).toBeGreaterThanOrEqual(1)
    expect(providers.some(p => p.id === 'mock')).toBe(true)
  })

  it('getRoutes returns configured routing rules', () => {
    const routes = registry.getRoutes()
    expect(routes).toHaveLength(2)
    expect(routes[0]).toMatchObject({ pattern: 'gpt-4*', provider: 'mock' })
    expect(routes[1]).toMatchObject({ pattern: 'claude-*', provider: 'mock' })
  })

  it('defaultProvider returns configured default', () => {
    expect(registry.defaultProvider).toBe('mock')
  })

  it('resolveProviderForModel returns provider id', () => {
    const id = registry.resolveProviderForModel('gpt-4-turbo')
    expect(id).toBe('mock')
  })

  it('resolveProviderForModel returns default for unmatched model', () => {
    const id = registry.resolveProviderForModel('unknown')
    expect(id).toBe('mock')
  })
})

describe('ProviderRegistry with empty config', () => {
  it('falls back to mock provider when no config is given', () => {
    const registry = new ProviderRegistry({ default: 'mock', providers: {} }, { rules: [] })
    const provider = registry.resolve('anything')
    expect(provider).not.toBeNull()
    expect(provider!.id).toBe('mock')
  })
})

describe('Provider validation', () => {
  let registry: ProviderRegistry
  const providersConfig: ProvidersConfig = {
    default: 'mock',
    providers: {
      mock: {},
    },
  }
  const routingConfig: RoutingConfig = { rules: [] }

  beforeAll(() => {
    registry = new ProviderRegistry(providersConfig, routingConfig)
  })

  it('MockProvider validate returns reachable', async () => {
    const provider = registry.getProvider('mock')
    expect(provider).toBeDefined()
    const result = await provider!.validate()
    expect(result.reachable).toBe(true)
    expect(result.authConfigured).toBe(true)
    expect(result.providerId).toBe('mock')
  })

  it('validateProvider returns result for existing provider', async () => {
    const result = await registry.validateProvider('mock')
    expect(result).not.toBeNull()
    expect(result!.reachable).toBe(true)
  })

  it('validateProvider returns null for unknown provider', async () => {
    const result = await registry.validateProvider('nonexistent')
    expect(result).toBeNull()
  })

  it('validateAll returns results for all providers', async () => {
    const results = await registry.validateAll()
    expect(results.length).toBeGreaterThanOrEqual(1)
    const mockResult = results.find(r => r.providerId === 'mock')
    expect(mockResult).toBeDefined()
    expect(mockResult!.reachable).toBe(true)
  })
})
