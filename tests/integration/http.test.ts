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

describe('HTTP server integration', () => {
  let app: ReturnType<typeof createServer>
  let storage: Storage
  let snapshotStore: SnapshotStore
  let registry: ProviderRegistry

  beforeAll(() => {
    const config = defaultConfig()
    storage = new Storage(':memory:')
    snapshotStore = new SnapshotStore(':memory:')
    registry = new ProviderRegistry({ default: 'mock', providers: { mock: {} } }, { rules: [] })
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
    const metrics = new MetricsCollector()
    const pluginRuntime = new PluginRuntime()

    app = createServer(config, pipeline, metrics, storage, snapshotStore, pluginRuntime, registry)
  })

  afterAll(() => {
    storage.close()
    snapshotStore.close()
  })

  it('POST /v1/chat/completions returns a valid response', async () => {
    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    })

    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toBeDefined()
    expect(body.content).toBeDefined()
    expect(body.pipelineTrace).toBeDefined()
    expect(body.runId).toBeDefined()
  })

  it('POST /v1/chat/completions records metrics', async () => {
    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'test-model',
        messages: [{ role: 'user', content: 'Test metrics' }],
      }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.inputTokenEstimate).toBeGreaterThan(0)
    expect(body.outputTokenEstimate).toBeGreaterThan(0)
  })

  it('POST /v1/chat/completions attaches trace', async () => {
    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'test-model',
        messages: [{ role: 'user', content: 'Check trace' }],
      }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pipelineTrace).toBeInstanceOf(Array)
    expect(body.pipelineTrace.length).toBeGreaterThan(0)

    const stageNames = body.pipelineTrace.map((t: any) => t.stage)
    expect(stageNames).toEqual([
      'collect', 'measure', 'budget', 'prune',
      'summarize', 'dedupe', 'compress', 'retrieve', 'forward',
    ])
  })

  it('GET /health returns ok', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
  })

  it('POST /v1/chat/completions with invalid body returns 400', async () => {
    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(400)
  })

  it('POST /v1/chat/completions with providers array invokes multi-run', async () => {
    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'test-model',
        messages: [{ role: 'user', content: 'Multi' }],
        providers: ['mock'],
      }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.groupId).toBeDefined()
    expect(body.runs).toBeInstanceOf(Array)
    expect(body.runs.length).toBe(1)
    expect(body.comparison).toBeDefined()
    expect(body.comparison.divergenceScore).toBeDefined()
  })

  it('GET /metrics returns summary', async () => {
    const res = await app.request('/metrics')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.requests).toBeGreaterThanOrEqual(0)
  })
})
