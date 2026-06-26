import type { StageDecision, StageResult } from '../pipeline/types.js'

export interface VerboseReporter {
  stageStart(stageName: string): void
  stageDecision(stageName: string, decision: StageDecision): void
  stageResult(stageName: string, result: StageResult): void
  trace(trace: StageResult[]): void
  metrics(metricsObject: unknown): void
}

export const isVerboseMode =
  process.env.VERBOSE === 'true' ||
  process.argv.includes('--verbose')

export function createVerboseReporter(enabled: boolean): VerboseReporter {
  if (!enabled) {
    return {
      stageStart() {},
      stageDecision() {},
      stageResult() {},
      trace() {},
      metrics() {},
    }
  }

  return {
    stageStart(stageName) {
      console.log(`[${stageName}] ▶ start`)
    },
    stageDecision(stageName, decision) {
      console.log(`[${stageName}] decision`, JSON.stringify(decision, null, 2))
    },
    stageResult(stageName, result) {
      console.log(`[${stageName}] result`, JSON.stringify(result, null, 2))
    },
    trace(fullTrace) {
      console.log('\n=== FULL PIPELINE TRACE ===')
      for (const entry of fullTrace) {
        console.log(`  ${entry.stage} → ${entry.status}`)
        if (entry.decision) {
          console.log(`    decision: ${JSON.stringify(entry.decision)}`)
        }
        if (entry.meta) {
          console.log(`    meta: ${JSON.stringify(entry.meta)}`)
        }
      }
    },
    metrics(metricsObject) {
      console.log('\n=== METRICS ===')
      console.log(JSON.stringify(metricsObject, null, 2))
    },
  }
}
