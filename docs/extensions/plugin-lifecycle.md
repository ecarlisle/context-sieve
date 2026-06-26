# Plugin Lifecycle

## Stage Transitions

```
┌─────────────────────────────────────────────────────────────────┐
│                        Plugin Lifecycle                          │
│                                                                  │
│  ┌──────────┐    ┌──────────────┐    ┌──────────┐               │
│  │ DISCOVER │───►│ MANIFEST     │───►│ UNLOADED │               │
│  │ (startup)│    │ (manifest.json)   │          │               │
│  └──────────┘    └──────────────┘    └────┬─────┘               │
│                                            │                     │
│                                            │ loadPlugin(id)      │
│                                            ▼                     │
│                                    ┌──────────────┐              │
│                                    │  LOADED      │              │
│                                    │ (module      │              │
│                                    │  imported)   │              │
│                                    └──────┬───────┘              │
│                                           │                      │
│                                           │ runtime.register()   │
│                                           ▼                      │
│                                    ┌──────────────┐              │
│                                    │  REGISTERED  │              │
│                                    │ (stages in   │              │
│                                    │  registry)   │              │
│                                    └──────┬───────┘              │
│                                           │                      │
│                                           │ runtime.enable()     │
│                                           ▼                      │
│                                    ┌──────────────┐              │
│                               ┌───►│   ENABLED    │              │
│                               │    │ (active in   │              │
│                               │    │  pipeline)   │              │
│                               │    └──────┬───────┘              │
│                               │           │                      │
│                               │           │ pipeline.run()       │
│                               │           ▼                      │
│                               │    ┌──────────────┐              │
│                               │    │  EXECUTING   │              │
│                               │    │ (stage.run() │              │
│                               │    │  called)     │              │
│                               │    └──────────────┘              │
│                               │           │                      │
│                               │           │ stage returns        │
│                               │           ▼                      │
│                               │    ┌──────────────┐              │
│                               │    │   COMPLETE   │              │
│                               │    │ (result in   │              │
│                               │    │  trace)      │              │
│                               │    └──────────────┘              │
│                               │                                  │
│                               │ runtime.disable()                │
│                               ▼                                  │
│                    ┌──────────────────┐                          │
│                    │    DISABLED      │                          │
│                    │ (stages removed  │                          │
│                    │  from pipeline)  │                          │
│                    └──────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Discovery

### When

At startup. The `listPlugins()` function reads `plugins/manifest.json`.

### What Happens

```typescript
const manifests = listPlugins()
// Returns: [{ id: 'token-heatmap', version: '0.1.0', enabled: false }, ...]
```

### State

`discovered` — the plugin is known but not loaded. No code is imported. No memory is allocated.

### Failure

If `manifest.json` is missing or malformed, discovery returns an empty list. No error is thrown.

---

## Phase 2: Load

### When

On explicit call to `loadPlugin(id)`.

### What Happens

```typescript
const plugin = await loadPlugin('token-heatmap')
```

1. The manifest is read to find the plugin's file path.
2. The plugin module is imported (`.ts` or `.js`).
3. The default export is validated as a `ContextSievePlugin`.
4. The plugin object is returned.

### State

`loaded` — the module is in memory. Stages and analyzers are available but not yet registered.

### Failure Modes

- **Module not found:** The file path in the manifest is wrong.
- **No default export:** The plugin file must have `export default plugin`.
- **Invalid plugin object:** Missing required fields (`id`, `version`).

---

## Phase 3: Register

### When

On explicit call to `runtime.register(plugin)`.

### What Happens

```typescript
runtime.register(plugin)
// Calls:
//   pipelineStages.register(stage)    for each plugin.stages[]
//   analyzers.register(analyzer)      for each plugin.analyzers[]
//   replays.register(extension)       for each plugin.replay[]
//   dashboards.register(extension)    for each plugin.dashboard[]
//   searches.register(extension)      for each plugin.search[]
```

Each registry validates the component before adding it:

- **PipelineStageRegistry:** Checks for duplicate stage names and cyclic dependencies.
- **AnalyzerRegistry:** Checks for duplicate analyzer names.
- **ReplayExtensionRegistry:** Checks for duplicate extension names.
- **DashboardExtensionRegistry:** Checks for duplicate widget names.
- **SearchExtensionRegistry:** Checks for duplicate filter names.

### State

`registered` — the plugin's components are in the registries but not active.

### Failure Modes

- **Duplicate stage name:** A stage with the same name already exists in the registry.
- **Cyclic dependency:** The plugin's stage position references a stage that references it back.
- **Unknown relativeTo:** The plugin's stage position references a built-in stage that doesn't exist.

---

## Phase 4: Enable

### When

On explicit call to `runtime.enable(pluginId)`.

### What Happens

```typescript
runtime.enable('token-heatmap')
// Pipeline stages become part of the resolved stage order
// Analyzers are added to the active analyzer list
// Extensions are available for replay, dashboard, search
```

The pipeline stage registry resolves the final stage order, including plugin stages:

```typescript
const resolvedStages = pipelineStages.resolve()
// [
//   collectStage,
//   measureStage,
//   tokenHeatmapStage,  // plugin stage inserted here
//   budgetStage,
//   ...
// ]
```

### State

`enabled` — the plugin is active. Its stages run during pipeline execution.

### Failure Modes

- **Plugin not registered:** Call `register()` before `enable()`.
- **Plugin not loaded:** Call `loadPlugin()` before `register()`.

---

## Phase 5: Execute

### When

During `pipeline.run(ctx)`.

### What Happens

```typescript
// Inside the pipeline loop
for (const stage of resolvedStages) {
  const result = await stage.run(ctx)
  trace.push(result)
}
```

Plugin stages:
- Receive the same `PipelineContext` as built-in stages.
- Can read `ctx.request`, `ctx.metrics`, `ctx.state`.
- Can write to `ctx.state` (key-value metadata).
- Cannot modify `ctx.request`, `ctx.response`, or `ctx.config`.
- Return `StageResult` with `meta` containing any data they produce.

### State

Plugin state per execution:
- `ctx.state` keys are available for the duration of the pipeline run.
- After execution, `ctx.state` is discarded.
- Plugin metadata is preserved in `pipelineTrace` as `StageResult.meta`.

### Failure Modes

- **Plugin throws:** The stage returns `status: 'error'`. The pipeline continues.
- **Plugin hangs:** The stage never returns. The pipeline blocks indefinitely (configurable timeout may be added in future).

---

## Phase 6: Disable

### When

On explicit call to `runtime.disable(pluginId)`.

### What Happens

```typescript
runtime.disable('token-heatmap')
// Plugin stages are removed from the resolved stage order
// Analyzers are removed from the active analyzer list
// Extensions are no longer available
```

The plugin module remains loaded in memory. Re-enabling is fast (no module re-import needed).

### State

`disabled` — the plugin is inactive but available for re-enable.

---

## Phase 7: Unload (Optional)

### When

Not currently implemented. Future versions may support unloading plugin modules to free memory.

---

## Lifecycle Command Reference

```bash
# Discover plugins (reads manifest.json)
context-sieve plugin list

# Load and register a plugin
context-sieve plugin enable <plugin-id>

# Deactivate without unloading
context-sieve plugin disable <plugin-id>
```

---

## API Reference

| Method | Phase | Effect |
|--------|-------|--------|
| `listPlugins()` | Discovery | Return all manifest entries |
| `loadPlugin(id)` | Loading | Import plugin module |
| `runtime.register(plugin)` | Registration | Add components to registries |
| `runtime.enable(id)` | Activation | Activate plugin components |
| `pipeline.run(ctx)` | Execution | Plugin stages run |
| `runtime.disable(id)` | Deactivation | Deactivate plugin components |
| `runtime.isEnabled(id)` | Query | Check if plugin is active |
| `runtime.getPlugin(id)` | Query | Get plugin object (if loaded) |
| `enablePlugin(id)` | Convenience | load + register + enable |
| `disablePlugin(id)` | Convenience | disable + (persist to manifest) |
