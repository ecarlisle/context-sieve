import type { PipelineStage, PipelineContext, StageResult } from '../pipeline/types.js'
import type { InferenceProvider } from '../providers/interface.js'
import type { ProviderRegistry } from '../providers/registry.js'
import { estimateTokens } from '../metrics/index.js'
import { shadowPrune, type SummaryHints } from './prune.js'
import { createSummarizeStage, type ShadowSummary } from './summarize.js'

export { createSummarizeStage }

export const collectStage: PipelineStage = {
  name: 'collect',
  async run(_ctx: PipelineContext): Promise<StageResult> {
    return { stage: 'collect', status: 'ok' }
  },
}

export const measureStage: PipelineStage = {
  name: 'measure',
  async run(ctx: PipelineContext): Promise<StageResult> {
    const text = ctx.request.messages.map(m => m.content).join('')
    const tokens = estimateTokens(text)
    ctx.metrics.estimatedInputTokens = tokens
    return { stage: 'measure', status: 'ok', meta: { tokens } }
  },
}

export const budgetStage: PipelineStage = {
  name: 'budget',
  async run(_ctx: PipelineContext): Promise<StageResult> {
    return { stage: 'budget', status: 'noop' }
  },
}

export const pruneStage: PipelineStage = {
  name: 'prune',
  async run(ctx: PipelineContext): Promise<StageResult> {
    const threshold = ctx.config.pruningThreshold

    const shadowSummary = ctx.state.get('shadowSummary') as ShadowSummary | undefined
    const summaryHints: SummaryHints | undefined =
      shadowSummary && shadowSummary.keyPoints.length > 0
        ? { keyPoints: shadowSummary.keyPoints, sourceSummaryId: shadowSummary.id }
        : undefined

    const result = shadowPrune(ctx.request, threshold, summaryHints)
    ctx.state.set('pruneResult', result)

    const isApplied = ctx.config.enablePruning && !ctx.config.enableShadowPruning

    if (isApplied) {
      ctx.request = result.pruned as typeof ctx.request
      return {
        stage: 'prune',
        status: 'ok',
        meta: {
          removedCount: result.removed.length,
          shadowMode: false,
          advisoryInfluenceUsed: result.advisoryInfluenceUsed,
          highestAdvisoryScore: result.highestAdvisoryScore,
          advisoryScoreCount: result.advisoryScores?.length ?? 0,
        },
      }
    }

    return {
      stage: 'prune',
      status: 'noop',
      meta: {
        removedCount: result.removed.length,
        shadowMode: true,
        candidates: ctx.request.messages.length,
        removable: result.removed.length,
        advisoryInfluenceUsed: result.advisoryInfluenceUsed,
        highestAdvisoryScore: result.highestAdvisoryScore,
        advisoryScoreCount: result.advisoryScores?.length ?? 0,
      },
    }
  },
}

export const dedupeStage: PipelineStage = {
  name: 'dedupe',
  async run(ctx: PipelineContext): Promise<StageResult> {
    if (!ctx.config.enableDeduplication) {
      return { stage: 'dedupe', status: 'noop' }
    }
    return { stage: 'dedupe', status: 'ok' }
  },
}

export const compressStage: PipelineStage = {
  name: 'compress',
  async run(ctx: PipelineContext): Promise<StageResult> {
    if (!ctx.config.enableCompression) {
      return { stage: 'compress', status: 'noop' }
    }
    return { stage: 'compress', status: 'ok' }
  },
}

export const retrieveStage: PipelineStage = {
  name: 'retrieve',
  async run(_ctx: PipelineContext): Promise<StageResult> {
    return { stage: 'retrieve', status: 'noop' }
  },
}

export function createForwardStage(provider: InferenceProvider): PipelineStage {
  return {
    name: 'forward',
    async run(ctx: PipelineContext): Promise<StageResult> {
      try {
        const response = await provider.chat(ctx.request)
        const inputEstimate = ctx.metrics.estimatedInputTokens
        const outputEstimate = response.outputTokenEstimate
        ctx.response = {
          ...response,
          inputTokenEstimate: inputEstimate,
          delta: outputEstimate - inputEstimate,
        }
        ctx.metrics.estimatedOutputTokens = outputEstimate
        ctx.metrics.endTime = Date.now()
        return { stage: 'forward', status: 'ok', meta: { tokens: outputEstimate } }
      } catch (error) {
        return { stage: 'forward', status: 'error', meta: { error: String(error) } }
      }
    },
  }
}

export function createRoutedForwardStage(registry: ProviderRegistry): PipelineStage {
  return {
    name: 'forward',
    async run(ctx: PipelineContext): Promise<StageResult> {
      try {
        const model = ctx.request.model
        const providerOverride = ctx.request.provider
        const resolvedProvider = registry.resolve(model, providerOverride)
        if (!resolvedProvider) {
          return { stage: 'forward', status: 'error', meta: { error: `No provider resolved for model "${model}"` } }
        }
        const forwardStart = Date.now()
        const response = await resolvedProvider.chat(ctx.request)
        const providerLatency = Date.now() - forwardStart
        const inputEstimate = ctx.metrics.estimatedInputTokens
        const outputEstimate = response.outputTokenEstimate
        ctx.response = {
          ...response,
          inputTokenEstimate: inputEstimate,
          delta: outputEstimate - inputEstimate,
        }
        ctx.metrics.estimatedOutputTokens = outputEstimate
        ctx.metrics.endTime = Date.now()
        return {
          stage: 'forward',
          status: 'ok',
          meta: {
            tokens: outputEstimate,
            providerId: resolvedProvider.id,
            providerLatency,
            resolvedModel: model,
          },
        }
      } catch (error) {
        return { stage: 'forward', status: 'error', meta: { error: String(error) } }
      }
    },
  }
}
