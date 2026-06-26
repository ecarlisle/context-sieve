# SDK Reference

The Plugin SDK is located at `src/plugins/sdk/types.ts`. It defines the TypeScript interfaces for building context-sieve plugins.

## Core Types

### `ContextSievePlugin`

The top-level plugin descriptor.

```ts
type ContextSievePlugin = {
  id: string
  version: string
  stages?: PluginStage[]
  analyzers?: PluginAnalyzer[]
  replay?: ReplayExtension[]
  dashboard?: DashboardExtension[]
  search?: SearchExtension[]
}
```

### `PluginStage`

A pipeline stage contributed by a plugin.

```ts
type PluginStage = {
  name: string
  position: 'before' | 'after'
  relativeTo: string
  run(ctx: PipelineContext): Promise<StageResult>
}
```

### `PluginAnalyzer`

A decision-time observer that enriches metadata.

```ts
type PluginAnalyzer = {
  name: string
  run(ctx: PipelineContext): Record<string, unknown>
}
```

### `ReplayExtension`

A replay-time overlay data provider.

```ts
type ReplayExtension = {
  name: string
  render(snapshot: RunSnapshot): Record<string, unknown>
}
```

### `DashboardExtension`

A dashboard card data provider.

```ts
type DashboardExtension = {
  name: string
  title: string
  render(snapshotStore: SnapshotStore): Record<string, unknown>
}
```

### `SearchExtension`

A custom search index.

```ts
type SearchExtension = {
  name: string
  index(runs: RunSnapshot[]): void
  search(query: string): Array<{ runId: string; reason: string }>
}
```

## Runtime Types

### `PluginManifest`

A registered plugin's persistent metadata.

```ts
type PluginManifest = {
  id: string
  version: string
  path: string
  enabled: boolean
}
```
