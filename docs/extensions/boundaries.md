# Extension Boundaries

## What Plugins May Do

Plugins operate within strict boundaries. They may:

1. **Observe pipeline context** — read `PipelineContext.request`, `config`, `metrics`, `state`
2. **Add metadata to state** — write to `ctx.state` for downstream stages
3. **Insert stages at fixed positions** — before or after a named built-in stage (not between arbitrary stages)
4. **Register analyzers** — enrich decision metadata without altering execution
5. **Fail gracefully** — a plugin crash does not break the pipeline

## What Plugins May NOT Do

| Operation | Why Forbidden |
|---|---|
| Reorder pipeline stages | Violates deterministic ordering guarantee |
| Skip a built-in stage | Pipeline order is fixed at construction |
| Modify `RunSnapshot` | Snapshots must be immutable |
| Call provider APIs | Transport is the provider layer's responsibility |
| Access snapshot storage | Storage is owned by the observation layer |
| Override routing decisions | Provider selection is the registry's responsibility |
| Access environment variables | Secrets are not exposed to plugin code |
| Read/write filesystem | Isolation guarantee — plugins operate on context only |
| Start background processes | Explicit side effects must be declared |
| Modify `ctx.request.messages` | Request immutability is a core invariant |

## Isolation Model

```
Plugin runtime
    │
    ├── Receives: PipelineContext (read + state write only)
    ├── Returns:  StageResult (status + meta)
    └── Cannot:   Access network, filesystem, storage, providers
```

Plugin stages run in the same process but are loaded as separate modules. A plugin crash is caught by the pipeline runner and converted to an error StageResult.

## Boundary Verification

The plugin runtime enforces these boundaries at registration time:

```typescript
runtime.register(plugin)
// Runtime verifies:
// 1. Stage positions reference existing built-in stages
// 2. No duplicate stage names
// 3. No circular stage dependencies
// 4. Analyzer names are unique within the plugin
```

Violations produce a registration error — the plugin is not loaded.
