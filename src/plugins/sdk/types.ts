import type { PipelineContext, StageResult } from '../../pipeline/types.js'
import type { SnapshotStore } from '../../snapshots/store.js'
import type { RunSnapshot } from '../../snapshots/types.js'

export type PluginPosition = 'before' | 'after'

export type PluginStage = {
  name: string
  position: PluginPosition
  relativeTo: string
  run(ctx: PipelineContext): Promise<StageResult>
}

export type PluginAnalyzer = {
  name: string
  run(ctx: PipelineContext): Record<string, unknown>
}

export type ReplayExtension = {
  name: string
  render(snapshot: RunSnapshot): Record<string, unknown>
}

export type DashboardExtension = {
  name: string
  title: string
  render(snapshotStore: SnapshotStore): Record<string, unknown>
}

export type SearchExtension = {
  name: string
  index(runs: RunSnapshot[]): void
  search(query: string): Array<{ runId: string; reason: string }>
}

export type ContextSievePlugin = {
  id: string
  version: string
  stages?: PluginStage[]
  analyzers?: PluginAnalyzer[]
  replay?: ReplayExtension[]
  dashboard?: DashboardExtension[]
  search?: SearchExtension[]
}

export type PluginManifest = {
  id: string
  version: string
  path: string
  enabled: boolean
}

export type PluginRegistrationResult = {
  plugin: ContextSievePlugin
  manifest: PluginManifest
}
