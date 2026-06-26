import { describe, it, expect } from 'vitest'
import { analyzeStage } from '../../src/pipeline/analyzer.js'
import type { PipelineContext } from '../../src/pipeline/types.js'
import { defaultConfig } from '../../src/config/index.js'

function createContext(messages: Array<{ role: string; content: string }>): PipelineContext {
  return {
    request: {
      model: 'test',
      messages: messages as any,
    },
    metrics: { estimatedInputTokens: 0, estimatedOutputTokens: 0, startTime: Date.now() },
    config: defaultConfig(),
    state: new Map(),
  }
}

describe('analyzeStage', () => {
  it('is deterministic — same input yields same decision', () => {
    const ctx = createContext([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'What is the capital of France?' },
    ])

    const a = analyzeStage('prune', ctx.request, ctx)
    const b = analyzeStage('prune', ctx.request, ctx)

    expect(a.eligible).toBe(b.eligible)
    expect(a.confidence).toBe(b.confidence)
    expect(a.intent).toBe(b.intent)
    if (a.pruneAnalysis && b.pruneAnalysis) {
      expect(a.pruneAnalysis.candidates).toBe(b.pruneAnalysis.candidates)
      expect(a.pruneAnalysis.removable).toBe(b.pruneAnalysis.removable)
    }
  })

  it('confidence is stable for repeated calls', () => {
    const ctx = createContext([
      { role: 'user', content: 'a'.repeat(500) },
      { role: 'user', content: 'b'.repeat(500) },
    ])

    const results = Array.from({ length: 10 }, () => analyzeStage('summarize', ctx.request, ctx))
    const confidences = results.map(r => r.confidence)

    expect(new Set(confidences).size).toBe(1)
  })

  it('does not mutate the context', () => {
    const ctx = createContext([
      { role: 'user', content: 'Hello world' },
    ])

    const before = JSON.stringify(ctx)
    analyzeStage('prune', ctx.request, ctx)
    const after = JSON.stringify(ctx)

    expect(after).toBe(before)
  })

  describe('stage-specific behavior', () => {
    it('collect: always eligible with full confidence', () => {
      const ctx = createContext([{ role: 'user', content: 'x' }])
      const d = analyzeStage('collect', ctx.request, ctx)
      expect(d.eligible).toBe(true)
      expect(d.confidence).toBe(1.0)
      expect(d.intent).toBe('collect')
    })

    it('measure: always eligible with full confidence', () => {
      const ctx = createContext([{ role: 'user', content: 'x' }])
      const d = analyzeStage('measure', ctx.request, ctx)
      expect(d.eligible).toBe(true)
      expect(d.confidence).toBe(1.0)
      expect(d.intent).toBe('measure')
    })

    it('budget: high confidence for large content, lower for small', () => {
      const small = createContext([{ role: 'user', content: 'Hi' }])
      const large = createContext([{ role: 'user', content: 'x'.repeat(500) }])

      const dSmall = analyzeStage('budget', small.request, small)
      const dLarge = analyzeStage('budget', large.request, large)

      expect(dSmall.confidence).toBeLessThan(dLarge.confidence)
      expect(dLarge.confidence).toBeGreaterThan(0.9)
    })

    it('prune: provides pruneAnalysis with candidates and removable', () => {
      const ctx = createContext([
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
        { role: 'user', content: 'How are you?' },
      ])

      const d = analyzeStage('prune', ctx.request, ctx)
      expect(d.pruneAnalysis).toBeDefined()
      expect(d.pruneAnalysis!.candidates).toBe(3)
      expect(d.pruneAnalysis!.removable).toBeGreaterThanOrEqual(0)
      expect(d.pruneAnalysis!.confidence).toBeGreaterThan(0)
    })

    it('summarize: confidence scales with content size', () => {
      const tiny = createContext([{ role: 'user', content: 'Hi' }])
      const big = createContext([{ role: 'user', content: 'x'.repeat(3000) }])

      const dTiny = analyzeStage('summarize', tiny.request, tiny)
      const dBig = analyzeStage('summarize', big.request, big)

      expect(dTiny.confidence).toBeLessThan(dBig.confidence)
      expect(dTiny.eligible).toBe(false)
      expect(dBig.eligible).toBe(true)
    })

    it('dedupe: confidence increases with message count', () => {
      const few = createContext([{ role: 'user', content: 'a' }, { role: 'user', content: 'b' }])
      const many = createContext(Array.from({ length: 6 }, (_, i) => ({ role: 'user' as const, content: `msg-${i}` })))

      const dFew = analyzeStage('dedupe', few.request, few)
      const dMany = analyzeStage('dedupe', many.request, many)

      expect(dFew.confidence).toBeLessThan(dMany.confidence)
    })

    it('compress: confidence scales with content size', () => {
      const small = createContext([{ role: 'user', content: 'Hi' }])
      const large = createContext([{ role: 'user', content: 'x'.repeat(5000) }])

      const dSmall = analyzeStage('compress', small.request, small)
      const dLarge = analyzeStage('compress', large.request, large)

      expect(dSmall.confidence).toBeLessThan(dLarge.confidence)
    })

    it('retrieve: never eligible', () => {
      const ctx = createContext([{ role: 'user', content: 'Hello' }])
      const d = analyzeStage('retrieve', ctx.request, ctx)
      expect(d.eligible).toBe(false)
      expect(d.confidence).toBe(0)
    })

    it('forward: always eligible with full confidence', () => {
      const ctx = createContext([{ role: 'user', content: 'x' }])
      const d = analyzeStage('forward', ctx.request, ctx)
      expect(d.eligible).toBe(true)
      expect(d.confidence).toBe(1.0)
      expect(d.intent).toBe('forward')
    })

    it('unknown stage: returns default decision', () => {
      const ctx = createContext([{ role: 'user', content: 'x' }])
      const d = analyzeStage('nonexistent', ctx.request, ctx)
      expect(d.eligible).toBe(false)
      expect(d.confidence).toBe(0)
    })
  })
})
