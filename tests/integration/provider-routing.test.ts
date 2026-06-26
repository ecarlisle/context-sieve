import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer } from '../../src/server/http.js'
import { Pipeline } from '../../src/pipeline/index.js'
import { MetricsCollector } from '../../src/metrics/index.js'
import { Storage } from '../../src/storage/sqlite.js'
import { defaultConfig } from '../../src/config/index.js'
import { SnapshotStore } from '../../src/snapshots/index.js'
import { ProviderRegistry } from '../../src/providers/registry.js'
import {
  collectStage,
  measureStage,
  budgetStage,
  pruneStage,
  dedupeStage,
  compressStage,
  retrieveStage,
  createSummarizeStage,
  createRoutedForwardStage,
} from '../../src/compression/index.js'
import { PluginRuntime } from '../../src/plugins/index.js'

describe('Provider routing integration', () => {
  let app: ReturnType<typeof createServer>
  let storage: Storage
  let snapshotStore: SnapshotStore
  let registry: ProviderRegistry
  let metrics: MetricsCollector

  beforeAll(() => {
    const config = defaultConfig()
    storage = new Storage(':memory:')
    snapshotStore = new SnapshotStore(':memory:')
    registry = new ProviderRegistry(
      { default: 'mock', providers: { mock: {} } },
      {
        rules: [
          { pattern: 'gpt-*', provider: 'mock' },
          { pattern: 'claude-*', provider: 'mock' },
        ],
      },
    )
    const pipeline = new Pipeline([
      collectStage,
      measureStage,
      budgetStage,
      pruneStage,
      createSummarizeStage(storage),
      dedupeStage,
      compressStage,
      retrieveStage,
      createRoutedForwardStage(registry),
    ])
    metrics = new MetricsCollector()
    const pluginRuntime = new PluginRuntime()

    app = createServer(config, pipeline, metrics, storage, snapshotStore, pluginRuntime, registry)
  })

  afterAll(() => {
    storage.close()
    snapshotStore.close()
  })

  it('routes to mock for unmatched model via default', async () => {
    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'unknown-model-123',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.provider).toBe('mock')
    expect(body.content).toBeDefined()
    expect(body.pipelineTrace).toBeDefined()
  })

  it('routes gpt-* model via routing rule', async () => {
    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.provider).toBe('mock')
    expect(body.content).toBeDefined()
    expect(body.pipelineTrace).toBeDefined()
  })

  it('routes claude-* model via routing rule', async () => {
    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.provider).toBe('mock')
    expect(body.content).toBeDefined()
  })

  it('uses explicit provider override', async () => {
    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hello' }],
        provider: 'mock',
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.provider).toBe('mock')
  })

  it('returns 400 for missing messages', async () => {
    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 for empty messages', async () => {
    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o', messages: [] }),
    })
    expect(res.status).toBe(400)
  })

  it('exposes provider distribution in metrics', async () => {
    const res = await app.request('/metrics', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.providerDistribution).toBeDefined()
    expect(typeof body.providerDistribution).toBe('object')
    expect(body.providerErrorCount).toBeDefined()
    expect(body.averageProviderLatencyMs).toBeDefined()
  })

  it('provider info appears in pipeline trace', async () => {
    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    const forwardTrace = body.pipelineTrace?.find((s: { stage: string }) => s.stage === 'forward')
    expect(forwardTrace).toBeDefined()
    expect(forwardTrace.meta.providerId).toBe('mock')
    expect(forwardTrace.meta.providerLatency).toBeGreaterThanOrEqual(0)
    expect(forwardTrace.meta.resolvedModel).toBe('gpt-4o')
  })
})
