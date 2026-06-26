import { describe, it, expect } from 'vitest'
import { Pipeline } from '../../src/pipeline/index.js'
import type { PipelineStage, PipelineContext, StageResult } from '../../src/pipeline/types.js'
import { defaultConfig } from '../../src/config/index.js'
import type { ChatCompletionRequest } from '../../src/types/index.js'

function createContext(overrides?: Partial<ChatCompletionRequest>): PipelineContext {
  return {
    request: {
      model: 'test-model',
      messages: [{ role: 'user', content: 'Hello' }],
      ...overrides,
    },
    metrics: {
      estimatedInputTokens: 10,
      estimatedOutputTokens: 0,
      startTime: Date.now(),
    },
    config: defaultConfig(),
    state: new Map(),
  }
}

describe('Pipeline', () => {
  it('stages execute in correct order', async () => {
    const order: string[] = []

    const stages: PipelineStage[] = [
      { name: 'alpha', run: async () => { order.push('alpha'); return { stage: 'alpha', status: 'ok' } } },
      { name: 'beta', run: async () => { order.push('beta'); return { stage: 'beta', status: 'ok' } } },
      { name: 'gamma', run: async () => { order.push('gamma'); return { stage: 'gamma', status: 'ok' } } },
    ]

    const pipeline = new Pipeline(stages)
    const result = await pipeline.run(createContext())

    expect(order).toEqual(['alpha', 'beta', 'gamma'])
    expect(result.trace.map(t => t.stage)).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('each stage executes exactly once', async () => {
    const counts = new Map<string, number>()

    const stages: PipelineStage[] = [
      { name: 'once-a', run: async () => { counts.set('once-a', (counts.get('once-a') ?? 0) + 1); return { stage: 'once-a', status: 'ok' } } },
      { name: 'once-b', run: async () => { counts.set('once-b', (counts.get('once-b') ?? 0) + 1); return { stage: 'once-b', status: 'ok' } } },
    ]

    const pipeline = new Pipeline(stages)
    await pipeline.run(createContext())

    expect(counts.get('once-a')).toBe(1)
    expect(counts.get('once-b')).toBe(1)
  })

  it('noop stages remain noop', async () => {
    const stages: PipelineStage[] = [
      { name: 'noop-test', run: async () => ({ stage: 'noop-test', status: 'noop' as const }) },
    ]

    const pipeline = new Pipeline(stages)
    const { trace } = await pipeline.run(createContext())

    expect(trace[0].status).toBe('noop')
  })

  it('trace is complete with all stage results', async () => {
    const stages: PipelineStage[] = [
      { name: 's1', run: async () => ({ stage: 's1', status: 'ok', meta: { val: 1 } }) },
      { name: 's2', run: async () => ({ stage: 's2', status: 'noop', meta: { val: 2 } }) },
      { name: 's3', run: async () => ({ stage: 's3', status: 'ok', meta: { val: 3 } }) },
    ]

    const pipeline = new Pipeline(stages)
    const { trace, ctx } = await pipeline.run(createContext())

    expect(trace).toHaveLength(3)
    expect(trace[0]).toMatchObject({ stage: 's1', status: 'ok', meta: { val: 1 } })
    expect(trace[1]).toMatchObject({ stage: 's2', status: 'noop', meta: { val: 2 } })
    expect(trace[2]).toMatchObject({ stage: 's3', status: 'ok', meta: { val: 3 } })
    expect(trace[0].decision).toBeDefined()
    expect(trace[1].decision).toBeDefined()
    expect(trace[2].decision).toBeDefined()
  })

  it('error stage does not halt subsequent stages', async () => {
    const order: string[] = []

    const stages: PipelineStage[] = [
      { name: 'good-1', run: async () => { order.push('good-1'); return { stage: 'good-1', status: 'ok' } } },
      { name: 'bad', run: async () => { order.push('bad'); throw new Error('boom') } },
      { name: 'good-2', run: async () => { order.push('good-2'); return { stage: 'good-2', status: 'ok' } } },
    ]

    const pipeline = new Pipeline(stages)
    const { trace } = await pipeline.run(createContext())

    expect(order).toEqual(['good-1', 'bad', 'good-2'])
    expect(trace[0].status).toBe('ok')
    expect(trace[1].status).toBe('error')
    expect(trace[1].meta?.error).toContain('boom')
    expect(trace[2].status).toBe('ok')
  })

  it('decision is attached to each stage result', async () => {
    const stages: PipelineStage[] = [
      { name: 'collect', run: async () => ({ stage: 'collect', status: 'ok' }) },
    ]

    const pipeline = new Pipeline(stages)
    const { trace } = await pipeline.run(createContext())

    expect(trace[0].decision).toBeDefined()
    expect(trace[0].decision!.eligible).toBe(true)
    expect(trace[0].decision!.intent).toBe('collect')
    expect(trace[0].decision!.confidence).toBeGreaterThanOrEqual(0)
  })

  it('returns the pipeline context', async () => {
    const stages: PipelineStage[] = [
      { name: 'echo', run: async (ctx) => {
        ctx.state.set('seen', true)
        return { stage: 'echo', status: 'ok' }
      }},
    ]

    const pipeline = new Pipeline(stages)
    const { ctx } = await pipeline.run(createContext())

    expect(ctx.state.get('seen')).toBe(true)
    expect(ctx.request.model).toBe('test-model')
    expect(ctx.metrics.startTime).toBeGreaterThan(0)
  })
})
