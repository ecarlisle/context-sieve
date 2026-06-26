import type { PipelineContext, PipelineStage, StageResult, PipelineRunResult } from './types.js'
import { analyzeStage } from './analyzer.js'
import { createVerboseReporter, type VerboseReporter } from '../telemetry/verbose.js'
import type { PluginRuntime } from '../plugins/runtime/runtime.js'

function formatStageLog(result: StageResult): string {
  let base = `[${result.stage}] → ${result.status}`

  if (result.decision) {
    base += ` (confidence: ${result.decision.confidence}, eligible: ${result.decision.eligible}`
  }

  if (result.meta) {
    const details = Object.entries(result.meta)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')
    base += result.decision ? `, ${details})` : ` (${details})`
  } else if (result.decision) {
    base += ')'
  }

  return base
}

export class Pipeline {
  private baseStages: PipelineStage[]
  private pluginRuntime: PluginRuntime | null
  private reporter: VerboseReporter

  constructor(stages: PipelineStage[], reporter?: VerboseReporter, pluginRuntime?: PluginRuntime) {
    this.baseStages = stages
    this.pluginRuntime = pluginRuntime ?? null
    this.reporter = reporter ?? createVerboseReporter(false)
  }

  private get stages(): PipelineStage[] {
    if (!this.pluginRuntime) return this.baseStages
    if (this.pluginRuntime.pipelineStages.stages.length === 0) return this.baseStages
    return this.pluginRuntime.resolvePipelineStages(this.baseStages)
  }

  async run(ctx: PipelineContext): Promise<PipelineRunResult> {
    const trace: StageResult[] = []
    const activeStages = this.stages

    for (const stage of activeStages) {
      this.reporter.stageStart(stage.name)

      const decision = analyzeStage(stage.name, ctx.request, ctx)
      this.reporter.stageDecision(stage.name, decision)

      let result: StageResult
      try {
        result = await stage.run(ctx)
      } catch (error) {
        result = {
          stage: stage.name,
          status: 'error',
          meta: { error: String(error) },
        }
      }

      result.decision = decision

      if (this.pluginRuntime) {
        const analyzerMeta = this.pluginRuntime.collectAnalyzerMetadata(ctx)
        if (Object.keys(analyzerMeta).length > 0) {
          result.meta = { ...result.meta, ...analyzerMeta }
        }
      }

      trace.push(result)

      this.reporter.stageResult(stage.name, result)
      console.log(formatStageLog(result))
    }

    this.reporter.trace(trace)
    this.reporter.metrics(ctx.metrics)

    return { ctx, trace }
  }
}
