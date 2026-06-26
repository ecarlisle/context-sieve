import type { RunSnapshot } from '../snapshots/types.js'

export type MultiRunResult = {
  groupId: string
  runs: RunSnapshot[]
  comparison: ComparisonReport
}

export type ComparisonReport = {
  divergenceScore: number
  tokenVariance: number
  latencyVariance: number
  structuralDiff: StructuralDiff
  providerRanking?: ProviderRanking[]
}

export type StructuralDiff = {
  pruneDiff: PruneDiff[]
  summaryDiff: SummaryDiff[]
  outputDiff: OutputDiff
}

export type PruneDiff = {
  provider: string
  removedCount: number
  shadowMode: boolean
  advisoryInfluenceUsed?: boolean
}

export type SummaryDiff = {
  provider: string
  summaryCount: number
  confidence: number
}

export type OutputDiff = {
  tokenRange: { min: number; max: number; avg: number }
  latencyRange: { min: number; max: number; avg: number }
  contentLengthRange: { min: number; max: number; avg: number }
}

export type ProviderRanking = {
  provider: string
  score: number
  tokenEfficiency: number
  latencyEfficiency: number
}
