import { describe, it, expect } from 'vitest'
import type { RunSnapshot } from '../../src/snapshots/types.js'

function createMinimalSnapshot(overrides?: Partial<RunSnapshot>): RunSnapshot {
  return {
    id: 'snap-test-001',
    timestamp: 1700000000000,
    request: {
      model: 'test-model',
      messages: [{ role: 'user', content: 'Hello' }],
    },
    response: {
      id: 'resp-001',
      content: 'Hi there!',
    },
    metrics: {
      inputTokens: 10,
      outputTokens: 5,
      delta: -5,
    },
    pipelineTrace: [
      { stage: 'collect', status: 'ok', decision: { eligible: true, intent: 'collect', confidence: 1.0 } },
      { stage: 'forward', status: 'ok', decision: { eligible: true, intent: 'forward', confidence: 1.0 } },
    ],
    ...overrides,
  }
}

describe('RunSnapshot', () => {
  describe('required fields', () => {
    it('has all required fields', () => {
      const snap = createMinimalSnapshot()
      expect(snap.id).toBeDefined()
      expect(snap.timestamp).toBeGreaterThan(0)
      expect(snap.request.model).toBeDefined()
      expect(snap.request.messages).toBeInstanceOf(Array)
      expect(snap.response.id).toBeDefined()
      expect(snap.response.content).toBeDefined()
      expect(snap.metrics.inputTokens).toBeGreaterThanOrEqual(0)
      expect(snap.metrics.outputTokens).toBeGreaterThanOrEqual(0)
      expect(snap.pipelineTrace).toBeInstanceOf(Array)
    })

    it('pipelineTrace is non-empty after a pipeline run', () => {
      const snap = createMinimalSnapshot()
      expect(snap.pipelineTrace.length).toBeGreaterThan(0)
    })

    it('each trace entry has stage, status, and decision', () => {
      const snap = createMinimalSnapshot()
      for (const entry of snap.pipelineTrace) {
        expect(entry.stage).toBeDefined()
        expect(entry.status).toBeDefined()
        expect(entry.decision).toBeDefined()
      }
    })
  })

  describe('immutability', () => {
    it('serialization round-trip preserves all fields', () => {
      const original = createMinimalSnapshot()
      const json = JSON.stringify(original)
      const parsed = JSON.parse(json) as RunSnapshot

      expect(parsed.id).toBe(original.id)
      expect(parsed.timestamp).toBe(original.timestamp)
      expect(parsed.request.model).toBe(original.request.model)
      expect(parsed.response.content).toBe(original.response.content)
      expect(parsed.metrics.inputTokens).toBe(original.metrics.inputTokens)
      expect(parsed.pipelineTrace).toHaveLength(original.pipelineTrace.length)
      expect(JSON.stringify(parsed)).toBe(json)
    })

    it('re-parsed snapshot is deeply equal', () => {
      const original = createMinimalSnapshot({
        prune: { removed: [{ type: 'message', content: 'old', reason: 'test' }], shadowMode: true, removable: 1 },
        summaries: { id: 'sum-1', keyPoints: ['point'], summary: 'text', confidence: 0.8, sourceCount: 1, sourceIds: ['msg-1'] },
        advisory: { scores: [{ messageIndex: 0, score: 0.5, reason: 'test' }], highestScore: 0.5, scoredCount: 1 },
        provider: { id: 'mock', model: 'test-model', latency: 100 },
      })

      const json = JSON.stringify(original)
      const parsed = JSON.parse(json) as RunSnapshot

      expect(parsed).toEqual(original)
    })
  })

  describe('optional fields', () => {
    it('prune field is present when pruning occurred', () => {
      const snap = createMinimalSnapshot({
        prune: { removed: [], shadowMode: true, removable: 0 },
      })
      expect(snap.prune).toBeDefined()
      expect(snap.prune!.shadowMode).toBe(true)
    })

    it('summaries field is present when summarization occurred', () => {
      const snap = createMinimalSnapshot({
        summaries: { id: 'sum-1', keyPoints: [], summary: '', confidence: 0, sourceCount: 0, sourceIds: [] },
      })
      expect(snap.summaries).toBeDefined()
    })

    it('provider field records execution metadata', () => {
      const snap = createMinimalSnapshot({
        provider: { id: 'openai', model: 'gpt-4', latency: 250 },
      })
      expect(snap.provider!.id).toBe('openai')
      expect(snap.provider!.latency).toBe(250)
    })

    it('multiRun field links provider runs to a group', () => {
      const snap = createMinimalSnapshot({
        multiRun: { groupId: 'group-1', provider: 'openai' },
      })
      expect(snap.multiRun!.groupId).toBe('group-1')
      expect(snap.multiRun!.provider).toBe('openai')
    })
  })

  describe('structural invariants', () => {
    it('request.messages preserve role and content', () => {
      const messages = [
        { role: 'system' as const, content: 'You are helpful.' },
        { role: 'user' as const, content: 'Hello' },
        { role: 'assistant' as const, content: 'Hi' },
      ]
      const snap = createMinimalSnapshot({ request: { model: 'test', messages } })
      expect(snap.request.messages).toHaveLength(3)
      expect(snap.request.messages[0].role).toBe('system')
      expect(snap.request.messages[1].content).toBe('Hello')
    })

    it('metrics delta equals outputTokens - inputTokens', () => {
      const snap = createMinimalSnapshot({ metrics: { inputTokens: 50, outputTokens: 30, delta: -20 } })
      expect(snap.metrics.delta).toBe(snap.metrics.outputTokens - snap.metrics.inputTokens)
    })
  })
})
