import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { Pipeline } from '../../src/pipeline/index.js'
import { defaultConfig } from '../../src/config/index.js'
import { captureRunSnapshot } from '../../src/snapshots/index.js'
import type { PipelineContext } from '../../src/pipeline/types.js'
import type { ChatCompletionRequest } from '../../src/types/index.js'
import { estimateTokens } from '../../src/metrics/index.js'
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
import { Storage } from '../../src/storage/sqlite.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

interface GoldenFixture {
  request: {
    model: string
    messages: Array<{ role: string; content: string }>
  }
  expectedTrace: string[]
  description: string
}

function createContext(fixture: GoldenFixture): PipelineContext {
  const request: ChatCompletionRequest = {
    model: fixture.request.model,
    messages: fixture.request.messages as any,
  }
  const totalChars = request.messages.reduce((s, m) => s + m.content.length, 0)
  return {
    request,
    metrics: {
      estimatedInputTokens: estimateTokens(totalChars),
      estimatedOutputTokens: 0,
      startTime: Date.now(),
    },
    config: defaultConfig(),
    state: new Map(),
  }
}

const fixturesDir = join(__dirname, '..', 'fixtures')
const fixtureFiles = readdirSync(fixturesDir).filter(f => f.endsWith('.json'))
const storage = new Storage(':memory:')
const registry = new ProviderRegistry({ default: 'mock', providers: { mock: {} } }, { rules: [] })
const pipeline = new Pipeline([
  collectStage,
  measureStage,
  budgetStage,
  createSummarizeStage(storage),
  pruneStage,
  dedupeStage,
  compressStage,
  retrieveStage,
  createRoutedForwardStage(registry),
])

describe('Golden replay tests', () => {
  for (const file of fixtureFiles) {
    it(`replays fixture: ${file}`, async () => {
      const fixture: GoldenFixture = JSON.parse(
        readFileSync(join(fixturesDir, file), 'utf-8'),
      )

      const ctx = createContext(fixture)
      const { trace } = await pipeline.run(ctx)

      const stageNames = trace.map(t => t.stage)
      expect(stageNames).toEqual(fixture.expectedTrace)
      expect(trace.length).toBe(fixture.expectedTrace.length)

      const snapshot = captureRunSnapshot(ctx, trace)
      expect(snapshot.id).toBeDefined()
      expect(snapshot.timestamp).toBeGreaterThan(0)
      expect(snapshot.pipelineTrace).toHaveLength(trace.length)
      expect(snapshot.request.messages).toHaveLength(fixture.request.messages.length)

      const roundTripped = JSON.parse(JSON.stringify(snapshot))
      expect(roundTripped).toEqual(snapshot)

      for (const entry of trace) {
        expect(entry.decision).toBeDefined()
        expect(typeof entry.decision!.eligible).toBe('boolean')
        expect(typeof entry.decision!.confidence).toBe('number')
      }
    })
  }

  afterAll(() => {
    storage.close()
  })
})
