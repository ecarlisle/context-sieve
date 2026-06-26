import type { ChatCompletionRequest } from '../types/index.js'
import type { PipelineContext, StageResult } from '../pipeline/types.js'
import type { RunSnapshot } from '../snapshots/types.js'
import type { InferenceProvider } from '../providers/interface.js'
import type { ProviderRegistry } from '../providers/registry.js'
import type { Config } from '../config/index.js'
import { Pipeline } from '../pipeline/index.js'
import { captureRunSnapshot } from '../snapshots/capture.js'
import { defaultConfig } from '../config/index.js'
import {
  collectStage,
  measureStage,
  budgetStage,
  pruneStage,
  dedupeStage,
  compressStage,
  retrieveStage,
} from '../compression/index.js'
import type { MultiRunResult } from './types.js'
import { compareRuns } from './comparer.js'

export class MultiRunRunner {
  private providerRegistry: ProviderRegistry
  private config: Config

  constructor(providerRegistry: ProviderRegistry, config?: Config) {
    this.providerRegistry = providerRegistry
    this.config = config ?? defaultConfig()
  }

  async runAcrossProviders(
    request: ChatCompletionRequest,
    providerIds: string[],
  ): Promise<MultiRunResult> {
    const groupId = `mrun-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const runs: RunSnapshot[] = []

    for (const providerId of providerIds) {
      const provider = this.providerRegistry.getProvider(providerId)
      if (!provider) {
        console.warn(`[multirun] provider not found: ${providerId}, skipping`)
        continue
      }

      const runSnapshot = await this.executeSingleRun(request, provider, providerId, groupId)
      runs.push(runSnapshot)
    }

    const comparison = compareRuns(runs)

    return { groupId, runs, comparison }
  }

  private async executeSingleRun(
    request: ChatCompletionRequest,
    provider: InferenceProvider,
    providerId: string,
    groupId: string,
  ): Promise<RunSnapshot> {
    const pipeline = this.buildPipeline(provider)

    const isolatedRequest: ChatCompletionRequest = {
      model: request.model,
      messages: request.messages.map(m => ({ ...m })),
      stream: false,
      max_tokens: request.max_tokens,
      temperature: request.temperature,
    }

    const ctx: PipelineContext = {
      request: isolatedRequest,
      metrics: {
        estimatedInputTokens: 0,
        estimatedOutputTokens: 0,
        startTime: Date.now(),
      },
      config: this.config,
      state: new Map(),
    }

    const { trace } = await pipeline.run(ctx)

    const snapshot = captureRunSnapshot(ctx, trace)
    snapshot.multiRun = { groupId, provider: providerId }

    return snapshot
  }

  private buildPipeline(provider: InferenceProvider): Pipeline {
    const forwardStage = {
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
          return { stage: 'forward', status: 'ok', meta: { tokens: outputEstimate, providerId: provider.id, providerLatency: Date.now() - ctx.metrics.startTime } }
        } catch (error) {
          return { stage: 'forward', status: 'error', meta: { error: String(error), providerId: provider.id } }
        }
      },
    }

    return new Pipeline([
      collectStage,
      measureStage,
      budgetStage,
      pruneStage,
      dedupeStage,
      compressStage,
      retrieveStage,
      forwardStage,
    ])
  }
}
