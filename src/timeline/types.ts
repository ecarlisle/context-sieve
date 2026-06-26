import type { StageDecision } from '../pipeline/types.js'

export type TimelineFrame = {
  runId: string
  stage: string
  index: number
  input: unknown
  output: unknown
  decision?: StageDecision
  meta?: Record<string, unknown>
}

export type Timeline = {
  runId: string
  frames: TimelineFrame[]
}

export type TimelineDiff = {
  runAId: string
  runBId: string
  matchedFrames: Array<{
    stage: string
    frameA: TimelineFrame
    frameB: TimelineFrame
  }>
  divergencePoints: Array<{
    stage: string
    reason: 'removed' | 'summary' | 'advisory' | 'output-change'
    severity: number
    detail: string
  }>
  onlyInA: TimelineFrame[]
  onlyInB: TimelineFrame[]
}
