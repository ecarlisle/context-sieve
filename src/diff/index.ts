export type { RunSnapshot, ContextDiff, MessageRef } from './types.js'
export { compareRuns } from './contextDiff.js'
export { printDiff } from './printDiff.js'

import type { ChatMessage } from '../types/index.js'
import type { PipelineContext } from '../pipeline/types.js'
import type { RunSnapshot } from './types.js'
import type { PruneResult } from '../compression/prune.js'
import type { ShadowSummary } from '../compression/summarize.js'
import type { StageResult } from '../pipeline/types.js'

export function extractDiffSnapshot(
  ctx: PipelineContext,
  trace: StageResult[],
  requestId: string,
  originalInputMessages?: ChatMessage[],
): RunSnapshot {
  const pruneResult = ctx.state.get('pruneResult') as PruneResult | undefined
  const shadowSummary = ctx.state.get('shadowSummary') as ShadowSummary | undefined

  return {
    requestId,
    inputMessages: originalInputMessages ?? [...ctx.request.messages],
    finalMessages: [...ctx.request.messages],
    trace,
    pruneResult: pruneResult
      ? {
          original: pruneResult.original,
          pruned: pruneResult.pruned,
          removed: pruneResult.removed,
          advisoryScores: pruneResult.advisoryScores,
          advisoryInfluenceUsed: pruneResult.advisoryInfluenceUsed,
          highestAdvisoryScore: pruneResult.highestAdvisoryScore,
        }
      : undefined,
    shadowSummary: shadowSummary
      ? {
          id: shadowSummary.id,
          sourceIds: [...shadowSummary.sourceIds],
          summary: shadowSummary.summary,
          keyPoints: [...shadowSummary.keyPoints],
          confidence: shadowSummary.confidence,
        }
      : undefined,
  }
}
