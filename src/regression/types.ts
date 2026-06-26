export type RegressionCategory = 'prune' | 'summary' | 'advisory' | 'output'

export type RegressionSignal = {
  category: RegressionCategory
  severity: 'low' | 'medium' | 'high'
  metric: string
  baseline: number
  candidate: number
  delta: number
  evidence: string
}

export type RegressionReport = {
  id: string
  baselineRunIds: string[]
  candidateRunIds: string[]
  signals: RegressionSignal[]
  impactedStages: string[]
  severity: 'none' | 'low' | 'medium' | 'high'
  score: number
  createdAt: number
}
