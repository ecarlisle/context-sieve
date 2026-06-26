export interface MetricRecord {
  requestCount: number
  estimatedInputTokens: number
  estimatedOutputTokens: number
  latencyMs: number
  summaryConfidence?: number
  advisoryInfluenceUsed?: boolean
  highestAdvisoryScore?: number
  providerId?: string
  providerLatencyMs?: number
  providerError?: boolean
}

export class MetricsCollector {
  private records: MetricRecord[] = []

  record(record: MetricRecord): void {
    this.records.push(record)
  }

  getAll(): MetricRecord[] {
    return [...this.records]
  }

  summary(): {
    totalRequests: number
    totalInputTokens: number
    totalOutputTokens: number
    averageLatencyMs: number
    averageInputTokens: number
    averageOutputTokens: number
    totalSummariesGenerated: number
    averageSummaryConfidence: number
    totalAdvisoryInfluenceHits: number
    advisoryInfluenceHitRate: number
    averageAdvisoryScore: number
    providerDistribution: Record<string, number>
    providerErrorCount: number
    averageProviderLatencyMs: number
  } {
    const n = this.records.length
    const totalInputTokens = this.records.reduce((s, r) => s + r.estimatedInputTokens, 0)
    const totalOutputTokens = this.records.reduce((s, r) => s + r.estimatedOutputTokens, 0)
    const totalLatency = this.records.reduce((s, r) => s + r.latencyMs, 0)

    const summaryRecords = this.records.filter(r => r.summaryConfidence !== undefined)
    const totalSummaries = summaryRecords.length
    const avgConfidence =
      totalSummaries > 0
        ? Math.round(
            (summaryRecords.reduce((s, r) => s + (r.summaryConfidence ?? 0), 0) /
              totalSummaries) *
              100,
          ) / 100
        : 0

    const advisoryRecords = this.records.filter(r => r.advisoryInfluenceUsed !== undefined)
    const totalAdvisoryHits = advisoryRecords.filter(r => r.advisoryInfluenceUsed).length
    const advisoryHitRate =
      advisoryRecords.length > 0 ? Math.round((totalAdvisoryHits / advisoryRecords.length) * 100) / 100 : 0

    const advisoryScoreRecords = this.records.filter(
      r => r.highestAdvisoryScore !== undefined && r.highestAdvisoryScore !== null,
    )
    const avgAdvisoryScore =
      advisoryScoreRecords.length > 0
        ? Math.round(
            (advisoryScoreRecords.reduce((s, r) => s + (r.highestAdvisoryScore as number), 0) /
              advisoryScoreRecords.length) *
              100,
          ) / 100
        : 0

    const providerDistribution: Record<string, number> = {}
    for (const r of this.records) {
      if (r.providerId) {
        providerDistribution[r.providerId] = (providerDistribution[r.providerId] ?? 0) + 1
      }
    }

    const providerErrorCount = this.records.filter(r => r.providerError).length

    const providerLatencies = this.records.filter(r => r.providerLatencyMs !== undefined)
    const totalProviderLatency = providerLatencies.reduce((s, r) => s + (r.providerLatencyMs ?? 0), 0)
    const averageProviderLatencyMs = providerLatencies.length > 0 ? Math.round(totalProviderLatency / providerLatencies.length) : 0

    return {
      totalRequests: n,
      totalInputTokens,
      totalOutputTokens,
      averageLatencyMs: n > 0 ? Math.round(totalLatency / n) : 0,
      averageInputTokens: n > 0 ? Math.round(totalInputTokens / n) : 0,
      averageOutputTokens: n > 0 ? Math.round(totalOutputTokens / n) : 0,
      totalSummariesGenerated: totalSummaries,
      averageSummaryConfidence: avgConfidence,
      totalAdvisoryInfluenceHits: totalAdvisoryHits,
      advisoryInfluenceHitRate: advisoryHitRate,
      averageAdvisoryScore: avgAdvisoryScore,
      providerDistribution,
      providerErrorCount,
      averageProviderLatencyMs,
    }
  }

  clear(): void {
    this.records = []
  }
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
