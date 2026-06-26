import { Hono } from 'hono'
import { z } from 'zod'
import type { Pipeline } from '../pipeline/index.js'
import type { MetricsCollector } from '../metrics/index.js'
import type { Config } from '../config/index.js'
import type { Storage } from '../storage/sqlite.js'
import type { PipelineContext } from '../pipeline/types.js'
import { extractDiffSnapshot } from '../diff/index.js'
import { captureRunSnapshot, SnapshotStore } from '../snapshots/index.js'
import { ReplayStore } from '../replay/index.js'
import { AnnotationStore } from '../annotations/index.js'
import { SearchIndex } from '../search/index.js'
import { WorkspaceStore } from '../workspaces/index.js'
import { isVerboseMode } from '../telemetry/verbose.js'
import { createUiServer } from './ui.js'
import { PluginRuntime } from '../plugins/index.js'
import { ProviderRegistry } from '../providers/registry.js'
import { MultiRunRunner } from '../multirun/index.js'

const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
})

const ChatCompletionRequestSchema = z.object({
  model: z.string(),
  messages: z.array(ChatMessageSchema).min(1),
  stream: z.boolean().optional().default(false),
  max_tokens: z.number().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  provider: z.string().optional(),
  providers: z.array(z.string()).optional(),
})

export function createServer(
  config: Config,
  pipeline: Pipeline,
  metrics: MetricsCollector,
  storage: Storage,
  snapshotStore?: SnapshotStore,
  pluginRuntime?: PluginRuntime,
  providerRegistry?: ProviderRegistry,
) {
  const app = new Hono()

  app.post('/v1/chat/completions', async c => {
    const handlerStart = Date.now()

    const body = await c.req.json()
    const parsed = ChatCompletionRequestSchema.safeParse(body)

    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400)
    }

    const request = {
      model: parsed.data.model,
      messages: parsed.data.messages,
      stream: parsed.data.stream,
      max_tokens: parsed.data.max_tokens,
      temperature: parsed.data.temperature,
      provider: parsed.data.provider,
      providers: parsed.data.providers,
    }

    // Multi-provider fanout
    if (request.providers && request.providers.length > 0 && providerRegistry) {
      const runner = new MultiRunRunner(providerRegistry, config)
      const multiResult = await runner.runAcrossProviders(request, request.providers)

      // Save all snapshots
      if (snapshotStore) {
        for (const snap of multiResult.runs) {
          try {
            snapshotStore.saveSnapshot(snap)
          } catch {
            // Storage errors must not fail the request
          }
        }
      }

      // Record metrics for each run
      for (const snap of multiResult.runs) {
        metrics.record({
          requestCount: 1,
          estimatedInputTokens: snap.metrics.inputTokens,
          estimatedOutputTokens: snap.metrics.outputTokens,
          latencyMs: snap.provider?.latency ?? 0,
          providerId: snap.provider?.id,
          providerLatencyMs: snap.provider?.latency,
        })
      }

      return c.json({
        groupId: multiResult.groupId,
        runs: multiResult.runs.map(s => ({ id: s.id, provider: s.multiRun?.provider })),
        comparison: multiResult.comparison,
      })
    }

    const ctx: PipelineContext = {
      request,
      metrics: {
        estimatedInputTokens: 0,
        estimatedOutputTokens: 0,
        startTime: Date.now(),
      },
      config,
      state: new Map(),
    }

    const originalMessages = request.messages.map(m => ({ ...m }))

    const { ctx: result, trace } = await pipeline.run(ctx)

    if (!result.response) {
      return c.json({ error: 'Pipeline did not produce a response' }, 500)
    }

    const latencyMs = Date.now() - handlerStart
    const inputEstimate = result.metrics.estimatedInputTokens
    const outputEstimate = result.metrics.estimatedOutputTokens

    const traceSummary = trace.find(s => s.stage === 'summarize')?.meta
    const summaryConfidence = traceSummary?.confidence as number | undefined
    const tracePrune = trace.find(s => s.stage === 'prune')?.meta
    const advisoryInfluenceUsed = tracePrune?.advisoryInfluenceUsed as boolean | undefined
    const highestAdvisoryScore = tracePrune?.highestAdvisoryScore as number | undefined
    const providerForward = trace.find(s => s.stage === 'forward')

    metrics.record({
      requestCount: 1,
      estimatedInputTokens: inputEstimate,
      estimatedOutputTokens: outputEstimate,
      latencyMs,
      summaryConfidence,
      advisoryInfluenceUsed,
      highestAdvisoryScore,
      providerId: providerForward?.meta?.providerId as string | undefined,
      providerLatencyMs: providerForward?.meta?.providerLatency as number | undefined,
      providerError: trace.some(s => s.stage === 'forward' && s.status === 'error'),
    })

    try {
      storage.insertRequestTrace({
        requestId: result.response.id,
        model: request.model,
        inputTokens: inputEstimate,
        outputTokens: outputEstimate,
        latencyMs,
      })
    } catch {
      // Storage errors should not fail the request
    }

    const diffSnapshot = extractDiffSnapshot(result, trace, result.response.id, originalMessages)

    const storedSnapshot = captureRunSnapshot(result, trace)
    if (snapshotStore) {
      try {
        snapshotStore.saveSnapshot(storedSnapshot)
        if (isVerboseMode) {
          console.log(`[snapshot] saved run snapshot id=${storedSnapshot.id}`)
        }
      } catch {
        // Storage errors must not fail the request
      }
    }

    const providerId = providerForward?.meta?.providerId as string | undefined

    const responseBody = {
      ...result.response,
      provider: providerId,
      pipelineTrace: trace,
      diffSnapshot,
      runId: storedSnapshot.id,
    }

    if (parsed.data.stream) {
      const content = result.response.content
      const traceEvent = JSON.stringify({ pipelineTrace: trace })
      const stream = new ReadableStream({
        async start(controller) {
          controller.enqueue(new TextEncoder().encode(`data: ${traceEvent}\n\n`))

          for (let i = 0; i < content.length; i += 5) {
            const chunk = content.slice(i, i + 5)
            const data = JSON.stringify({
              id: result.response!.id,
              content: chunk,
              outputTokenEstimate: result.response!.outputTokenEstimate,
              inputTokenEstimate: result.response!.inputTokenEstimate,
              delta: result.response!.delta,
            })
            controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`))
            await new Promise(r => setTimeout(r, 10))
          }
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
          controller.close()
        },
      })

      return c.newResponse(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }

    return c.json(responseBody)
  })

  app.get('/metrics', c => {
    const s = metrics.summary()
    return c.json({
      requests: s.totalRequests,
      avgInputTokens: s.averageInputTokens,
      avgOutputTokens: s.averageOutputTokens,
      avgLatencyMs: s.averageLatencyMs,
      totalSummariesGenerated: s.totalSummariesGenerated,
      avgSummaryConfidence: s.averageSummaryConfidence,
      totalAdvisoryInfluenceHits: s.totalAdvisoryInfluenceHits,
      advisoryInfluenceHitRate: s.advisoryInfluenceHitRate,
      averageAdvisoryScore: s.averageAdvisoryScore,
      providerDistribution: s.providerDistribution,
      providerErrorCount: s.providerErrorCount,
      averageProviderLatencyMs: s.averageProviderLatencyMs,
    })
  })

  app.get('/health', c => {
    return c.json({ status: 'ok' })
  })

  if (snapshotStore) {
    const replayStore = new ReplayStore()
    const annotationStore = new AnnotationStore()
    const workspaceStore = new WorkspaceStore()
    const searchIndex = new SearchIndex(snapshotStore, annotationStore, replayStore)
    searchIndex.buildIndex()
    const runtime = pluginRuntime ?? new PluginRuntime()
    const uiApp = createUiServer(snapshotStore, replayStore, annotationStore, searchIndex, workspaceStore, runtime, providerRegistry)
    app.route('/', uiApp)

    app.get('/', c => c.redirect('/ui'))
  }

  return app
}
