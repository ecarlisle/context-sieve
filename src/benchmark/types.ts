export type BenchmarkMetrics = {
  efficiency: {
    inputTokensBefore: number
    inputTokensAfter: number
    outputTokensBefore: number
    outputTokensAfter: number
    reductionPct: number
  }
  integrity: {
    preservedRatio: number
    summaryRatio: number
    removedRatio: number
  }
  stability: {
    divergenceCount: number
    causalCount: number
    regressionScore: number
  }
  performance: {
    processingOverheadMs: number
  }
}

export type BenchmarkRecommendation = 'keep' | 'review' | 'reject'

export type BenchmarkReport = {
  id: string
  runId: string
  originalSnapshotId: string
  optimizedSnapshotId?: string
  metrics: BenchmarkMetrics
  score: number
  recommendation: BenchmarkRecommendation
  createdAt: number
}
