import { randomUUID } from 'node:crypto'
import type { SnapshotStore } from '../snapshots/store.js'
import type { RegressionReport, RegressionSignal } from './types.js'

function avg(nums: number[]): number {
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
}

export function detectRegression(
  baselineRunIds: string[],
  candidateRunIds: string[],
  snapshotStore: SnapshotStore,
): RegressionReport {
  const signals: RegressionSignal[] = []
  const impactedStages = new Set<string>()

  const baselineSnapshots = baselineRunIds.map(id => snapshotStore.getSnapshotById(id)).filter(Boolean)
  const candidateSnapshots = candidateRunIds.map(id => snapshotStore.getSnapshotById(id)).filter(Boolean)

  const baseInputTokens = baselineSnapshots.map(s => s!.metrics.inputTokens)
  const candInputTokens = candidateSnapshots.map(s => s!.metrics.inputTokens)
  const baseInputAvg = avg(baseInputTokens)
  const candInputAvg = avg(candInputTokens)
  if (baseInputAvg > 0) {
    const delta = candInputAvg - baseInputAvg
    const pct = delta / baseInputAvg
    if (Math.abs(pct) > 0.1) {
      signals.push({
        category: 'prune',
        severity: Math.abs(pct) > 0.3 ? 'high' : Math.abs(pct) > 0.2 ? 'medium' : 'low',
        metric: 'input_tokens',
        baseline: baseInputAvg,
        candidate: candInputAvg,
        delta: pct,
        evidence: `Input tokens changed by ${(pct * 100).toFixed(1)}% (${baseInputAvg.toFixed(0)} → ${candInputAvg.toFixed(0)})`,
      })
      impactedStages.add('collect')
      impactedStages.add('measure')
    }
  }

  const baseOutputTokens = baselineSnapshots.map(s => s!.metrics.outputTokens)
  const candOutputTokens = candidateSnapshots.map(s => s!.metrics.outputTokens)
  const baseOutputAvg = avg(baseOutputTokens)
  const candOutputAvg = avg(candOutputTokens)
  if (baseOutputAvg > 0) {
    const delta = candOutputAvg - baseOutputAvg
    const pct = delta / baseOutputAvg
    if (Math.abs(pct) > 0.1) {
      signals.push({
        category: 'output',
        severity: Math.abs(pct) > 0.3 ? 'high' : Math.abs(pct) > 0.2 ? 'medium' : 'low',
        metric: 'output_tokens',
        baseline: baseOutputAvg,
        candidate: candOutputAvg,
        delta: pct,
        evidence: `Output tokens changed by ${(pct * 100).toFixed(1)}% (${baseOutputAvg.toFixed(0)} → ${candOutputAvg.toFixed(0)})`,
      })
      impactedStages.add('forward')
    }
  }

  const basePruneCount = baselineSnapshots.filter(s => s!.prune).length
  const candPruneCount = candidateSnapshots.filter(s => s!.prune).length
  const basePrunePct = basePruneCount / baselineSnapshots.length
  const candPrunePct = candPruneCount / candidateSnapshots.length
  if (Math.abs(candPrunePct - basePrunePct) > 0.15) {
    signals.push({
      category: 'prune',
      severity: Math.abs(candPrunePct - basePrunePct) > 0.3 ? 'high' : 'medium',
      metric: 'prune_usage',
      baseline: basePrunePct,
      candidate: candPrunePct,
      delta: candPrunePct - basePrunePct,
      evidence: `Prune usage changed from ${(basePrunePct * 100).toFixed(0)}% to ${(candPrunePct * 100).toFixed(0)}% of runs`,
    })
    impactedStages.add('prune')
  }

  const baseSumCount = baselineSnapshots.filter(s => s!.summaries).length
  const candSumCount = candidateSnapshots.filter(s => s!.summaries).length
  const baseSumPct = baseSumCount / baselineSnapshots.length
  const candSumPct = candSumCount / candidateSnapshots.length
  if (Math.abs(candSumPct - baseSumPct) > 0.15) {
    signals.push({
      category: 'summary',
      severity: Math.abs(candSumPct - baseSumPct) > 0.3 ? 'high' : 'medium',
      metric: 'summary_usage',
      baseline: baseSumPct,
      candidate: candSumPct,
      delta: candSumPct - baseSumPct,
      evidence: `Summary usage changed from ${(baseSumPct * 100).toFixed(0)}% to ${(candSumPct * 100).toFixed(0)}% of runs`,
    })
    impactedStages.add('summarize')
  }

  const baseConfidences = baselineSnapshots.map(s => s!.summaries?.confidence).filter((c): c is number => c !== undefined)
  const candConfidences = candidateSnapshots.map(s => s!.summaries?.confidence).filter((c): c is number => c !== undefined)
  const baseConfAvg = avg(baseConfidences)
  const candConfAvg = avg(candConfidences)
  if (baseConfAvg > 0 && Math.abs(candConfAvg - baseConfAvg) > 0.1) {
    signals.push({
      category: 'summary',
      severity: Math.abs(candConfAvg - baseConfAvg) > 0.25 ? 'high' : 'medium',
      metric: 'summary_confidence',
      baseline: baseConfAvg,
      candidate: candConfAvg,
      delta: candConfAvg - baseConfAvg,
      evidence: `Summary confidence drifted from ${baseConfAvg.toFixed(2)} to ${candConfAvg.toFixed(2)}`,
    })
    impactedStages.add('summarize')
  }

  const baseAdvisoryScores = baselineSnapshots.map(s => s!.advisory?.highestScore).filter((s): s is number => s !== undefined)
  const candAdvisoryScores = candidateSnapshots.map(s => s!.advisory?.highestScore).filter((s): s is number => s !== undefined)
  const baseAdvAvg = avg(baseAdvisoryScores)
  const candAdvAvg = avg(candAdvisoryScores)
  if (baseAdvAvg > 0 && Math.abs(candAdvAvg - baseAdvAvg) > 10) {
    signals.push({
      category: 'advisory',
      severity: Math.abs(candAdvAvg - baseAdvAvg) > 25 ? 'high' : Math.abs(candAdvAvg - baseAdvAvg) > 15 ? 'medium' : 'low',
      metric: 'advisory_score',
      baseline: baseAdvAvg,
      candidate: candAdvAvg,
      delta: candAdvAvg - baseAdvAvg,
      evidence: `Advisory score drifted from ${baseAdvAvg.toFixed(0)} to ${candAdvAvg.toFixed(0)}`,
    })
    impactedStages.add('advisory')
  }

  const baseStoryCount = baselineSnapshots.reduce((s, snap) => s + (snap!.pipelineTrace?.length || 0), 0) / baselineSnapshots.length
  const candStoryCount = candidateSnapshots.reduce((s, snap) => s + (snap!.pipelineTrace?.length || 0), 0) / candidateSnapshots.length
  if (Math.abs(candStoryCount - baseStoryCount) > 0) {
    impactedStages.add('collect')
  }

  const maxSeverity: RegressionReport['severity'] = signals.length === 0
    ? 'none'
    : signals.some(s => s.severity === 'high') ? 'high'
    : signals.some(s => s.severity === 'medium') ? 'medium'
    : 'low'

  const score = signals.length === 0 ? 0 : Math.min(100, Math.round(
    signals.reduce((acc, s) => {
      const base = s.severity === 'high' ? 25 : s.severity === 'medium' ? 10 : 3
      return acc + base * Math.abs(s.delta)
    }, 0) * 10,
  ))

  return {
    id: randomUUID(),
    baselineRunIds,
    candidateRunIds,
    signals,
    impactedStages: [...impactedStages],
    severity: maxSeverity,
    score,
    createdAt: Date.now(),
  }
}
