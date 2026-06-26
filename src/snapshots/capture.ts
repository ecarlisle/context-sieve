import type { PipelineContext } from '../pipeline/types.js'
import type { StageResult } from '../pipeline/types.js'
import type { RunSnapshot } from './types.js'
import type { PruneResult } from '../compression/prune.js'
import type { ShadowSummary } from '../compression/summarize.js'

export function captureRunSnapshot(
  ctx: PipelineContext,
  trace: StageResult[],
): RunSnapshot {
  const pruneResult = ctx.state.get('pruneResult') as PruneResult | undefined
  const shadowSummary = ctx.state.get('shadowSummary') as ShadowSummary | undefined

  const id = `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  return {
    id,
    timestamp: Date.now(),

    request: {
      model: ctx.request.model,
      messages: ctx.request.messages.map(m => ({ ...m })),
    },

    response: {
      id: ctx.response?.id ?? '',
      content: ctx.response?.content ?? '',
    },

    metrics: {
      inputTokens: ctx.metrics.estimatedInputTokens,
      outputTokens: ctx.metrics.estimatedOutputTokens ?? 0,
      delta: ctx.response?.delta ?? 0,
    },

    pipelineTrace: trace,

    prune: pruneResult
      ? {
          removed: pruneResult.removed.map(r => ({
            type: r.type,
            content: r.content,
            reason: r.reason,
          })),
          shadowMode: !ctx.config.enablePruning || ctx.config.enableShadowPruning,
          removable: pruneResult.removed.length,
          advisoryInfluenceUsed: pruneResult.advisoryInfluenceUsed,
          highestAdvisoryScore: pruneResult.highestAdvisoryScore,
        }
      : undefined,

    summaries: shadowSummary
      ? {
          id: shadowSummary.id,
          keyPoints: [...shadowSummary.keyPoints],
          summary: shadowSummary.summary,
          confidence: shadowSummary.confidence,
          sourceCount: shadowSummary.sourceIds.length,
          sourceIds: [...shadowSummary.sourceIds],
        }
      : undefined,

    advisory: pruneResult?.advisoryScores
      ? {
          scores: pruneResult.advisoryScores.map(s => ({
            messageIndex: s.messageIndex,
            score: s.advisoryScore,
            reason: s.reason,
          })),
          highestScore: pruneResult.highestAdvisoryScore,
          scoredCount: pruneResult.advisoryScores.length,
        }
      : undefined,

    provider: extractProviderInfo(trace),
    multiRun: ctx.state.get('multiRun') as { groupId: string; provider: string } | undefined,
  }
}

function extractProviderInfo(trace: StageResult[]): RunSnapshot['provider'] {
  const forwardTrace = trace.find(s => s.stage === 'forward')
  if (!forwardTrace?.meta) return undefined
  const providerId = forwardTrace.meta.providerId as string | undefined
  if (!providerId) return undefined
  return {
    id: providerId,
    model: (forwardTrace.meta.resolvedModel as string) ?? '',
    latency: (forwardTrace.meta.providerLatency as number) ?? 0,
  }
}
