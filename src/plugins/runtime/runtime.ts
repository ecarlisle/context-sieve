import type { PipelineStage } from '../../pipeline/types.js'
import type { SnapshotStore } from '../../snapshots/store.js'
import type { RunSnapshot } from '../../snapshots/types.js'
import type { SearchIndex } from '../../search/searchIndex.js'
import type { ContextSievePlugin } from '../sdk/types.js'
import {
  PipelineStageRegistry,
  AnalyzerRegistry,
  ReplayExtensionRegistry,
  DashboardExtensionRegistry,
  SearchExtensionRegistry,
} from './registries.js'

export type PluginRuntimeOptions = {
  snapshotStore?: SnapshotStore
  searchIndex?: SearchIndex
}

export class PluginRuntime {
  readonly pipelineStages: PipelineStageRegistry
  readonly analyzers: AnalyzerRegistry
  readonly replays: ReplayExtensionRegistry
  readonly dashboards: DashboardExtensionRegistry
  readonly searches: SearchExtensionRegistry

  private _plugins: Map<string, ContextSievePlugin> = new Map()
  private _enabled: Set<string> = new Set()

  constructor(_options?: PluginRuntimeOptions) {
    this.pipelineStages = new PipelineStageRegistry()
    this.analyzers = new AnalyzerRegistry()
    this.replays = new ReplayExtensionRegistry()
    this.dashboards = new DashboardExtensionRegistry()
    this.searches = new SearchExtensionRegistry()
  }

  register(plugin: ContextSievePlugin): void {
    if (this._plugins.has(plugin.id)) {
      throw new Error(`Plugin "${plugin.id}" is already registered`)
    }
    this._plugins.set(plugin.id, plugin)
  }

  // fallow-ignore-next-line unused-class-member
  unregister(pluginId: string): boolean {
    if (!this._plugins.has(pluginId)) return false
    this.disable(pluginId)
    this._plugins.delete(pluginId)
    return true
  }

  enable(pluginId: string): void {
    const plugin = this._plugins.get(pluginId)
    if (!plugin) throw new Error(`Plugin "${pluginId}" not found`)
    if (this._enabled.has(pluginId)) return
    this._enabled.add(pluginId)
    this.pipelineStages.register(plugin)
    this.analyzers.register(plugin)
    this.replays.register(plugin)
    this.dashboards.register(plugin)
    this.searches.register(plugin)
  }

  disable(pluginId: string): void {
    if (!this._enabled.has(pluginId)) return
    this._enabled.delete(pluginId)
    this.pipelineStages.unregister(pluginId)
    this.analyzers.unregister(pluginId)
    this.replays.unregister(pluginId)
    this.dashboards.unregister(pluginId)
    this.searches.unregister(pluginId)
  }

  // fallow-ignore-next-line unused-class-member
  isEnabled(pluginId: string): boolean {
    return this._enabled.has(pluginId)
  }

  // fallow-ignore-next-line unused-class-member
  getPlugin(pluginId: string): ContextSievePlugin | undefined {
    return this._plugins.get(pluginId)
  }

  // fallow-ignore-next-line unused-class-member
  listPlugins(): ContextSievePlugin[] {
    return Array.from(this._plugins.values())
  }

  resolvePipelineStages(baseStages: PipelineStage[]): PipelineStage[] {
    return this.pipelineStages.resolve(baseStages)
  }

  collectAnalyzerMetadata(ctx: Parameters<typeof this.analyzers.runAll>[0]): Record<string, unknown> {
    return this.analyzers.runAll(ctx)
  }

  // fallow-ignore-next-line unused-class-member
  getReplayExtensions(): Array<{ name: string; render(snapshot: RunSnapshot): Record<string, unknown> }> {
    return this.replays.extensions.map(e => ({ name: e.name, render: (snap: RunSnapshot) => e.render(snap) }))
  }

  // fallow-ignore-next-line unused-class-member
  getDashboardExtensions() {
    return this.dashboards.extensions.map(e => ({
      title: e.title,
      render: (snapshotStore: import('../../snapshots/store.js').SnapshotStore) => e.render(snapshotStore),
    }));
  }

  // fallow-ignore-next-line unused-class-member
  get searchExtensions() {
    return this.searches
  }

  // fallow-ignore-next-line unused-class-member
  get allPlugins(): Map<string, ContextSievePlugin> {
    return this._plugins
  }

  // fallow-ignore-next-line unused-class-member
  get enabledPlugins(): string[] {
    return Array.from(this._enabled)
  }
}

export type { ContextSievePlugin } from '../sdk/types.js'
