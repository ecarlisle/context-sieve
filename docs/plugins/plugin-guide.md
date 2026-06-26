# Plugin Guide

context-sieve supports third-party plugins that extend the platform with custom pipeline stages, decision analyzers, replay overlays, dashboard cards, and search providers.

## Architecture

Plugins extend context-sieve without modifying its core. The runtime loads plugins explicitly (no auto-discovery) and enforces strict isolation. Plugins may observe, annotate, and enrich — never mutate execution history.

## Plugin Structure

A plugin is a JavaScript module that exports a `ContextSievePlugin` as the default export:

```ts
import type { ContextSievePlugin } from 'context-sieve'

const plugin: ContextSievePlugin = {
  id: 'my-plugin',
  version: '0.1.0',
  stages: [],
  analyzers: [],
  replay: [],
  dashboard: [],
  search: [],
}

export default plugin
```

## Extension Points

### Pipeline Stages

Plugins can inject stages before or after any built-in stage:

| Position    | Description |
|-------------|-------------|
| `before`    | Runs immediately before the referenced stage |
| `after`     | Runs immediately after the referenced stage |

Built-in stages: `collect`, `measure`, `budget`, `summarize`, `prune`, `dedupe`, `compress`, `retrieve`, `forward`

```ts
const myStage: PluginStage = {
  name: 'my-stage',
  position: 'after',
  relativeTo: 'measure',
  async run(ctx) {
    return { stage: 'my-stage', status: 'ok', meta: {} }
  },
}
```

### Decision Analyzers

Analyzers observe pipeline context and enrich metadata. They must never block, change execution, or rewrite decisions.

```ts
const myAnalyzer: PluginAnalyzer = {
  name: 'my-analyzer',
  run(ctx) {
    return { myKey: ctx.request.messages.length }
  },
}
```

### Replay Extensions

Replay extensions render overlay data for replay artifact views.

```ts
const myReplay: ReplayExtension = {
  name: 'my-replay',
  render(snapshot) {
    return { myData: { ... } }
  },
}
```

### Dashboard Extensions

Dashboard extensions provide cards in the platform dashboard.

```ts
const myDashboard: DashboardExtension = {
  name: 'my-dashboard',
  title: 'My Card',
  render(snapshotStore) {
    return { value: 42 }
  },
}
```

### Search Extensions

Search providers add custom indexes to the search system. Search must remain deterministic and metadata-only — no vectors, no embeddings, no semantic ranking.

```ts
const mySearch: SearchExtension = {
  name: 'my-search',
  index(runs) {
    // build index
  },
  search(query) {
    return []
  },
}
```

## Safety Model

| Operation | Allowed |
|-----------|---------|
| Observe pipeline context | ✅ |
| Enrich metadata | ✅ |
| Annotate results | ✅ |
| Mutate snapshots | ❌ |
| Rewrite history | ❌ |
| Bypass pipeline | ❌ |
| Modify replay artifacts | ❌ |
| Alter stored benchmarks | ❌ |

## CLI Commands

```
context-sieve plugin create <name>     Create a plugin template
context-sieve plugin list              List registered plugins
context-sieve plugin enable <id>       Enable a plugin
context-sieve plugin disable <id>      Disable a plugin
```
