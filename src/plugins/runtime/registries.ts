import type { PipelineStage } from '../../pipeline/types.js'
import type {
  ContextSievePlugin,
  PluginStage,
  PluginAnalyzer,
  ReplayExtension,
  DashboardExtension,
  SearchExtension,
} from '../sdk/types.js'

export class PipelineStageRegistry {
  private _stages: PluginStage[] = []

  register(plugin: ContextSievePlugin): void {
    if (!plugin.stages) return
    const names = new Set<string>()
    for (const existing of this._stages) {
      if (names.has(existing.name)) {
        throw new Error(`Pipeline stage name conflict: "${existing.name}" from plugin "${existing.name}"`)
      }
      names.add(existing.name)
    }
    for (const stage of plugin.stages) {
      if (names.has(stage.name)) {
        throw new Error(`Pipeline stage name conflict: "${stage.name}" from plugin "${plugin.id}"`)
      }
      names.add(stage.name)
      this._stages.push(stage)
    }
  }

  unregister(pluginId: string): void {
    this._stages = this._stages.filter(s => s.name !== pluginId)
  }

  resolve(baseStages: PipelineStage[]): PipelineStage[] {
    if (this._stages.length === 0) return baseStages
    const resolved = [...baseStages]
    const seen = new Set(resolved.map(s => s.name))
    for (const ps of this._stages) {
      const idx = resolved.findIndex(s => s.name === ps.relativeTo)
      if (idx < 0) {
        throw new Error(`Plugin stage "${ps.name}" references unknown stage "${ps.relativeTo}"`)
      }
      if (seen.has(ps.name)) {
        throw new Error(`Plugin stage "${ps.name}" duplicates built-in stage name`)
      }
      seen.add(ps.name)
      const insertAt = ps.position === 'before' ? idx : idx + 1
      resolved.splice(insertAt, 0, {
        name: ps.name,
        async run(ctx) {
          return ps.run(ctx)
        },
      })
    }
    return resolved
  }

  get stages(): readonly PluginStage[] {
    return this._stages
  }
}

export class AnalyzerRegistry {
  private _analyzers: PluginAnalyzer[] = []

  register(plugin: ContextSievePlugin): void {
    if (!plugin.analyzers) return
    for (const a of plugin.analyzers) {
      this._analyzers.push(a)
    }
  }

  unregister(_pluginId: string): void {
    this._analyzers = []
  }

  runAll(ctx: Parameters<PluginAnalyzer['run']>[0]): Record<string, unknown> {
    const merged: Record<string, unknown> = {}
    for (const a of this._analyzers) {
      const result = a.run(ctx)
      Object.assign(merged, result)
    }
    return merged
  }

  // fallow-ignore-next-line unused-class-member
  get analyzers(): readonly PluginAnalyzer[] {
    return this._analyzers
  }
}

export class ReplayExtensionRegistry {
  private _extensions: ReplayExtension[] = []

  register(plugin: ContextSievePlugin): void {
    if (!plugin.replay) return
    for (const e of plugin.replay) {
      this._extensions.push(e)
    }
  }

  unregister(_pluginId: string): void {
    this._extensions = []
  }

  // fallow-ignore-next-line unused-class-member
  runAll(snapshot: Parameters<ReplayExtension['render']>[0]): Array<{ name: string; data: Record<string, unknown> }> {
    return this._extensions.map(e => ({
      name: e.name,
      data: e.render(snapshot),
    }))
  }

  get extensions(): readonly ReplayExtension[] {
    return this._extensions
  }
}

export class DashboardExtensionRegistry {
  private _extensions: DashboardExtension[] = []

  register(plugin: ContextSievePlugin): void {
    if (!plugin.dashboard) return
    for (const e of plugin.dashboard) {
      this._extensions.push(e)
    }
  }

  unregister(_pluginId: string): void {
    this._extensions = []
  }

  // fallow-ignore-next-line unused-class-member
  runAll(snapshotStore: Parameters<DashboardExtension['render']>[0]): Array<{ title: string; data: Record<string, unknown> }> {
    return this._extensions.map(e => ({
      title: e.title,
      data: e.render(snapshotStore),
    }))
  }

  get extensions(): readonly DashboardExtension[] {
    return this._extensions
  }
}

export class SearchExtensionRegistry {
  private _extensions: SearchExtension[] = []

  register(plugin: ContextSievePlugin): void {
    if (!plugin.search) return
    for (const e of plugin.search) {
      this._extensions.push(e)
    }
  }

  unregister(_pluginId: string): void {
    this._extensions = []
  }

  // fallow-ignore-next-line unused-class-member
  buildAll(runs: Parameters<SearchExtension['index']>[0]): void {
    for (const e of this._extensions) {
      e.index(runs)
    }
  }

  // fallow-ignore-next-line unused-class-member
  searchAll(query: string): Array<{ plugin: string; runId: string; reason: string }> {
    const results: Array<{ plugin: string; runId: string; reason: string }> = []
    for (const e of this._extensions) {
      for (const r of e.search(query)) {
        results.push({ plugin: e.name, ...r })
      }
    }
    return results
  }

  // fallow-ignore-next-line unused-class-member
  get extensions(): readonly SearchExtension[] {
    return this._extensions
  }
}
