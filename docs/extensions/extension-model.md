# Extension Model (Plugins)

## Overview

Plugins are extensions that inject custom logic into the pipeline at predefined points. They can observe, enrich, and annotate — but never mutate execution artifacts, alter stage order, or bypass pipeline boundaries.

```
Pipeline
  │
  ├─ collect (built-in)
  ├─ measure (built-in)
  ├─ plugin-stage (injected after measure)
  ├─ budget (built-in)
  ├─ ...
  │
  └─ forward (built-in)
```

---

## Plugin Lifecycle

A plugin progresses through five stages during its lifetime:

```
DISCOVERY ──► REGISTRATION ──► ACTIVATION ──► EXECUTION ──► DEACTIVATION
```

### 1. Discovery

Plugins are discovered from the `plugins/manifest.json` file. This file lists all known plugins and their metadata:

```json
{
  "plugins": [
    {
      "id": "token-heatmap",
      "version": "0.1.0",
      "path": "./sample-plugins/token-heatmap/plugin.ts",
      "enabled": false
    }
  ]
}
```

Discovery happens once at startup.

### 2. Registration

A plugin is loaded into the `PluginRuntime` via `loadPlugin(id)`. This:

- Reads the plugin manifest.
- Imports the plugin module.
- Registers its stages, analyzers, and extensions with the appropriate registries.

```typescript
const plugin = await loadPlugin('token-heatmap')
runtime.register(plugin)
```

### 3. Activation

A registered plugin is activated via `runtime.enable(pluginId)`. Activation:

- Resolves plugin stage positions in the pipeline.
- Registers analyzers with the analyzer registry.
- Registers replay, dashboard, and search extensions.

Activation is the point at which the plugin becomes visible to the pipeline.

### 4. Execution

During pipeline execution, enabled plugin stages run at their resolved positions:

```typescript
for (const stage of resolvedStages) {
  const result = await stage.run(ctx)
  trace.push(result)
}
```

Plugin stages receive the same `PipelineContext` as built-in stages. They can read messages, metrics, and state — but they cannot modify the request or response.

### 5. Deactivation

A plugin is deactivated via `runtime.disable(pluginId)`. Deactivation removes its stages from the pipeline resolution and unregisters its extensions. The plugin module remains loaded but is not called.

---

## Execution Boundaries

### Allowed

| Action | Details |
|--------|---------|
| **Read** `PipelineContext.request` | Observe messages, model, and parameters |
| **Read** `PipelineContext.metrics` | Observe token estimates and timing |
| **Read** `PipelineContext.state` | Read stage-to-stage communication keys |
| **Write** to `PipelineContext.state` | Add metadata for subsequent stages or extensions |
| **Return** `StageResult` | Report status and structured metadata |
| **Enrich** replay frames | Via `ReplayExtension` (add visualizations or data) |
| **Add** dashboard widgets | Via `DashboardExtension` |
| **Provide** search filters | Via `SearchExtension` |

### Forbidden

| Action | Consequence |
|--------|-------------|
| **Modify** `PipelineContext.request` | Changes the request forwarded to the provider |
| **Modify** `PipelineContext.response` | Changes the response returned to the client |
| **Call** the provider directly | Bypasses routing and pipeline guarantees |
| **Write** snapshots | Violates immutability |
| **Modify** stage order | Reorders execution unpredictably |
| **Access** other plugins' data | Breaks isolation |
| **Throw unhandled errors** | May crash the pipeline |
| **Run async background tasks** | May overlap with subsequent pipeline executions |

---

## When to Use a Plugin

| Scenario | Plugin Type | Example |
|----------|-------------|---------|
| Add metadata before pruning | Stage (position: before 'prune') | Inject message importance scores |
| Log request patterns | Stage (position: after 'forward') | Write custom metrics |
| Add custom visualizations to replay | ReplayExtension | Token heatmap overlay |
| Add dashboard panels | DashboardExtension | Custom charts and stats |
| Filter search results by custom field | SearchExtension | Search by metadata field |

---

## When NOT to Use a Plugin

| Scenario | Alternative |
|----------|-------------|
| Change how pruning works | Modify the built-in prune stage |
| Add a new provider | Write a provider adapter |
| Change routing rules | Edit `config/routing.yaml` |
| Store additional data | Write to a separate file or database |
| Run periodic tasks | Use an external scheduler (cron, systemd timer) |

---

## Isolation Guarantees

1. **No cross-plugin state.** Plugins cannot read or write each other's variables.
2. **No pipeline mutation.** Plugin stages cannot modify `ctx.request` or `ctx.response`.
3. **No storage access.** Plugins cannot write to snapshot store, replay store, or SQLite.
4. **No provider access.** Plugins cannot resolve or call providers.
5. **No stage reordering.** Plugin positions are fixed at activation time.
6. **No execution persistence.** Plugin stage results are ephemeral (included in trace but not persisted separately).

---

## Misbehavior Patterns

| Misbehavior | Symptom | Detection |
|-------------|---------|-----------|
| Plugin modifies `ctx.request` | Pipeline sends unexpected content to provider | Compare request before and after plugin stage |
| Plugin throws unhandled error | Pipeline stage returns `status: 'error'` | Check trace for plugin stage |
| Plugin reads another plugin's state | Inconsistent or corrupted metadata | Plugin state keys are namespaced by plugin ID |
| Plugin stage runs too long | Increased pipeline latency | Stage timing in trace metadata |
| Plugin generates misleading output | Replay shows unexpected data | ReplayExtension output is visible in timeline |

---

## Common Failure Modes

**"My plugin stage never runs."**
The plugin may not be enabled. Check `runtime.isEnabled(pluginId)`. If disabled, enable it.

**"My plugin stage runs but I can't see its output."**
Plugin stages return `StageResult` with `meta`. This metadata is included in the pipeline trace. Check `context-sieve debug <runId>` and look for your plugin's stage name.

**"My ReplayExtension doesn't appear."**
The extension must be registered and the plugin must be enabled. Replay extensions are loaded when the timeline is built.

**"My plugin crashes the server."**
Plugin code runs in the same process. An unhandled exception in a plugin stage may crash the server. Wrap plugin stage execution in try-catch and return `status: 'error'` on failure.
