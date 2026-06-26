import type { RunSnapshot as StoredSnapshot } from './types.js'
import type { RunSnapshot as DiffSnapshot } from '../diff/types.js'

export function storedToDiffSnapshot(stored: StoredSnapshot): DiffSnapshot {
  return {
    requestId: stored.id,
    inputMessages: stored.request.messages,
    finalMessages: stored.request.messages,
    trace: stored.pipelineTrace,
    pruneResult: stored.prune
      ? {
          original: {
            model: stored.request.model,
            messages: stored.request.messages,
          },
          pruned: {
            model: stored.request.model,
            messages: stored.request.messages,
          },
          removed: stored.prune.removed.map(r => ({
            type: r.type as 'redundant' | 'low-value' | 'duplicate' | 'noise',
            content: r.content,
            reason: r.reason,
          })),
          advisoryScores: stored.advisory?.scores
            ? stored.advisory.scores.map(s => ({
                messageIndex: s.messageIndex,
                advisoryScore: s.score,
                reason: s.reason,
              }))
            : undefined,
          advisoryInfluenceUsed: stored.prune.advisoryInfluenceUsed,
          highestAdvisoryScore: stored.prune.highestAdvisoryScore,
        }
      : undefined,
    shadowSummary: stored.summaries
      ? {
          id: stored.summaries.id,
          sourceIds: stored.summaries.sourceIds,
          summary: stored.summaries.summary,
          keyPoints: stored.summaries.keyPoints,
          confidence: stored.summaries.confidence,
        }
      : undefined,
  }
}
