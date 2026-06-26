import type { RunSnapshot } from '../snapshots/types.js'
import type { ComparisonReport, StructuralDiff, PruneDiff, SummaryDiff, OutputDiff, ProviderRanking } from './types.js'

export function compareRuns(runs: RunSnapshot[]): ComparisonReport {
  if (runs.length === 0) {
    return {
      divergenceScore: 0,
      tokenVariance: 0,
      latencyVariance: 0,
      structuralDiff: {
        pruneDiff: [],
        summaryDiff: [],
        outputDiff: computeOutputDiff(runs),
      },
    }
  }

  if (runs.length === 1) {
    return {
      divergenceScore: 0,
      tokenVariance: 0,
      latencyVariance: 0,
      structuralDiff: {
        pruneDiff: extractPruneDiffs(runs),
        summaryDiff: extractSummaryDiffs(runs),
        outputDiff: computeOutputDiff(runs),
      },
      providerRanking: [{
        provider: runs[0].provider?.id ?? 'unknown',
        score: 100,
        tokenEfficiency: 1,
        latencyEfficiency: 1,
      }],
    }
  }

  const tokenVariance = computeTokenVariance(runs)
  const latencyVariance = computeLatencyVariance(runs)
  const pruneDiff = extractPruneDiffs(runs)
  const summaryDiff = extractSummaryDiffs(runs)
  const outputDiff = computeOutputDiff(runs)

  const structuralDiff: StructuralDiff = { pruneDiff, summaryDiff, outputDiff }

  const pruneScore = pruneDiff.length > 0
    ? Math.max(0, 1 - pruneDiff.reduce((max, p) => Math.max(max, Math.abs(p.removedCount)), 0) / 10)
    : 1

  const summaryScore = summaryDiff.length > 0
    ? Math.max(0, 1 - summaryDiff.reduce((max, s) => Math.max(max, Math.abs(s.confidence)), 0))
    : 1

  const tokenScore = Math.max(0, 1 - tokenVariance)
  const latencyScore = Math.max(0, 1 - latencyVariance / 1000)

  const divergenceScore = Math.round(
    (1 - (pruneScore * 0.3 + summaryScore * 0.2 + tokenScore * 0.3 + latencyScore * 0.2)) * 100,
  ) / 100

  const providerRanking = computeProviderRanking(runs)

  return {
    divergenceScore,
    tokenVariance: Math.round(tokenVariance * 100) / 100,
    latencyVariance: Math.round(latencyVariance),
    structuralDiff,
    providerRanking,
  }
}

function computeTokenVariance(runs: RunSnapshot[]): number {
  const tokens = runs.map(r => r.metrics.outputTokens)
  const mean = tokens.reduce((s, v) => s + v, 0) / tokens.length
  const variance = tokens.reduce((s, v) => s + (v - mean) ** 2, 0) / tokens.length
  return mean > 0 ? Math.sqrt(variance) / mean : 0
}

function computeLatencyVariance(runs: RunSnapshot[]): number {
  const latencies = runs.map(r => r.provider?.latency ?? 0)
  const mean = latencies.reduce((s, v) => s + v, 0) / latencies.length
  const variance = latencies.reduce((s, v) => s + (v - mean) ** 2, 0) / latencies.length
  return Math.sqrt(variance)
}

function extractPruneDiffs(runs: RunSnapshot[]): PruneDiff[] {
  return runs.map(r => ({
    provider: r.provider?.id ?? r.multiRun?.provider ?? 'unknown',
    removedCount: r.prune?.removable ?? 0,
    shadowMode: r.prune?.shadowMode ?? true,
    advisoryInfluenceUsed: r.prune?.advisoryInfluenceUsed,
  }))
}

function extractSummaryDiffs(runs: RunSnapshot[]): SummaryDiff[] {
  return runs.map(r => ({
    provider: r.provider?.id ?? r.multiRun?.provider ?? 'unknown',
    summaryCount: r.summaries ? 1 : 0,
    confidence: r.summaries?.confidence ?? 0,
  }))
}

function computeOutputDiff(runs: RunSnapshot[]): OutputDiff {
  const tokens = runs.map(r => r.metrics.outputTokens)
  const latencies = runs.map(r => r.provider?.latency ?? 0)
  const contentLengths = runs.map(r => r.response.content.length)

  return {
    tokenRange: {
      min: Math.min(...tokens),
      max: Math.max(...tokens),
      avg: tokens.reduce((s, v) => s + v, 0) / tokens.length,
    },
    latencyRange: {
      min: Math.min(...latencies),
      max: Math.max(...latencies),
      avg: latencies.reduce((s, v) => s + v, 0) / latencies.length,
    },
    contentLengthRange: {
      min: Math.min(...contentLengths),
      max: Math.max(...contentLengths),
      avg: contentLengths.reduce((s, v) => s + v, 0) / contentLengths.length,
    },
  }
}

function computeProviderRanking(runs: RunSnapshot[]): ProviderRanking[] {
  const maxTokens = Math.max(...runs.map(r => r.metrics.outputTokens), 1)
  const maxLatency = Math.max(...runs.map(r => r.provider?.latency ?? 0), 1)
  const maxContentLen = Math.max(...runs.map(r => r.response.content.length), 1)

  return runs.map(r => {
    const tokenEfficiency = 1 - (r.metrics.outputTokens / maxTokens) * 0.5
    const latencyEfficiency = 1 - ((r.provider?.latency ?? 0) / maxLatency) * 0.3
    const contentScore = r.response.content.length / maxContentLen * 0.2
    const score = Math.round(Math.min(100, Math.max(0, (tokenEfficiency + latencyEfficiency + contentScore) * 100)))

    return {
      provider: r.provider?.id ?? r.multiRun?.provider ?? 'unknown',
      score,
      tokenEfficiency: Math.round(tokenEfficiency * 100) / 100,
      latencyEfficiency: Math.round(latencyEfficiency * 100) / 100,
    }
  }).sort((a, b) => b.score - a.score)
}
