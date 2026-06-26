# Runtime Model

The Plugin Runtime manages the lifecycle of all plugins in context-sieve.

## Lifecycle

```
Register  →  Load  →  Enable  →  Execute  →  Disable  →  Unregister
```

1. **Register** — Plugin metadata (id, version, path) is persisted to the plugin manifest.
2. **Load** — The plugin module is imported and its default export is verified.
3. **Enable** — The plugin's extensions are registered with the runtime's registries.
4. **Execute** — During pipeline execution, plugin stages are resolved into the pipeline order.
5. **Disable** — All extensions are removed from runtime registries.
6. **Unregister** — The plugin manifest is removed.

## Stage Resolution

When plugins contribute stages, the runtime resolves them into the base pipeline order:

```
Before: plugin → stage
After:  stage → plugin
```

Example: A plugin with `{ name: 'my-stage', position: 'after', relativeTo: 'measure' }` produces:

```
collect → measure → my-stage → budget → summarize → ...
```

Cycle detection rejects duplicate stage names.

## Workspace Scoping

Plugins are workspace-scoped. Each workspace's manifest lists which plugins are active. When switching workspaces, the runtime enables/disables plugins accordingly.

## Isolation

- Plugins run in the same process but are isolated by API contract.
- No plugin gains access to internal pipeline state beyond `PipelineContext`.
- Replay extensions receive only snapshot data.
- Dashboard extensions receive only the `SnapshotStore` interface.
