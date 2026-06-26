import { randomUUID } from 'node:crypto'
import type { SnapshotStore } from '../snapshots/store.js'
import type { RunSnapshot } from '../snapshots/types.js'
import type { BenchmarkReport, BenchmarkMetrics, BenchmarkRecommendation } from './types.js'

function avg(nums: number[]): number {
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
}

// fallow-ignore-next-line unused-export
export function benchmarkRun(
  original: RunSnapshot,
  optimized: RunSnapshot,
): BenchmarkMetrics {
  const inputBefore = original.metrics.inputTokens
  const inputAfter = optimized.metrics.inputTokens
  const outputBefore = original.metrics.outputTokens
  const outputAfter = optimized.metrics.outputTokens

  const reductionPct = inputBefore > 0
    ? Math.round(((inputBefore - inputAfter) / inputBefore) * 10000) / 100
    : 0

  const preservedRatio = inputAfter > 0
    ? Math.min(1, inputAfter / inputBefore)
    : 0

  const originalStages = original.pipelineTrace || []
  const optimizedStages = optimized.pipelineTrace || []

  const removedCount = Math.max(0, originalStages.length - optimizedStages.length)
  const removedRatio = originalStages.length > 0
    ? Math.round((removedCount / originalStages.length) * 100) / 100
    : 0

  const summaryRatio = (optimized.summaries ? 1 : 0)

  const originalConfigScore = original.prune
    ? (original.prune.removable || 0) * 2
    : 0
  const optimizedConfigScore = optimized.prune
    ? (optimized.prune.removable || 0) * 2
    : 0

  const divergenceCount = Math.abs(originalStages.length - optimizedStages.length)
  const causalCount = (original.summaries ? 1 : 0) + (optimized.summaries ? 1 : 0)
  const regressionScore = Math.abs(originalConfigScore - optimizedConfigScore)

  const processingOverhead = Math.abs(
    (optimized.metrics.delta || 0) - (original.metrics.delta || 0),
  )

  return {
    efficiency: {
      inputTokensBefore: inputBefore,
      inputTokensAfter: inputAfter,
      outputTokensBefore: outputBefore,
      outputTokensAfter: outputAfter,
      reductionPct,
    },
    integrity: {
      preservedRatio: Math.round(preservedRatio * 100) / 100,
      summaryRatio,
      removedRatio,
    },
    stability: {
      divergenceCount,
      causalCount,
      regressionScore,
    },
    performance: {
      processingOverheadMs: processingOverhead,
    },
  }
}

export function benchmarkCompare(
  originalRunId: string,
  optimizedRunId: string,
  snapshotStore: SnapshotStore,
): BenchmarkReport {
  const original = snapshotStore.getSnapshotById(originalRunId)
  const optimized = snapshotStore.getSnapshotById(optimizedRunId)
  if (!original || !optimized) {
    throw new Error('One or both snapshots not found')
  }

  const metrics = benchmarkRun(original, optimized)

  let score = 0
  score += Math.min(40, Math.round(metrics.efficiency.reductionPct * 0.8))
  score += Math.min(20, Math.round(metrics.integrity.preservedRatio * 20))
  score += Math.min(20, Math.round((1 - metrics.stability.regressionScore / 100) * 20))
  score += Math.min(20, metrics.stability.causalCount * 10)
  score = Math.min(100, score)

  let recommendation: BenchmarkRecommendation = 'keep'
  if (score < 30) recommendation = 'reject'
  else if (score < 60) recommendation = 'review'

  return {
    id: randomUUID(),
    runId: optimizedRunId,
    originalSnapshotId: originalRunId,
    optimizedSnapshotId: optimizedRunId,
    metrics,
    score,
    recommendation,
    createdAt: Date.now(),
  }
}

export function benchmarkRunAgainstAverage(
  runId: string,
  snapshotStore: SnapshotStore,
): BenchmarkReport | null {
  const run = snapshotStore.getSnapshotById(runId)
  if (!run) return null

  const allRuns = snapshotStore.listSnapshots(10000)
  if (allRuns.length < 2) return null

  const avgInput = avg(allRuns.map(r => r.inputTokens))
  const avgOutput = avg(allRuns.map(r => r.outputTokens))

  const syntheticOriginal: RunSnapshot = {
    id: 'synthetic-average',
    timestamp: run.timestamp,
    request: run.request,
    response: run.response,
    metrics: {
      inputTokens: Math.round(avgInput),
      outputTokens: Math.round(avgOutput),
      delta: run.metrics.delta,
    },
    pipelineTrace: run.pipelineTrace,
  }

  const metrics = benchmarkRun(syntheticOriginal, run)

  let score = 0
  score += Math.min(40, Math.round(metrics.efficiency.reductionPct * 0.8))
  score += Math.min(20, Math.round(metrics.integrity.preservedRatio * 20))
  score += Math.min(40, 40 - Math.abs(run.metrics.inputTokens - avgInput) / avgInput * 40)
  score = Math.max(0, Math.min(100, score))

  let recommendation: BenchmarkRecommendation = 'keep'
  if (score < 30) recommendation = 'reject'
  else if (score < 60) recommendation = 'review'

  return {
    id: randomUUID(),
    runId,
    originalSnapshotId: 'synthetic-average',
    metrics,
    score,
    recommendation,
    createdAt: Date.now(),
  }
}
