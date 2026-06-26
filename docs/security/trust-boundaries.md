# Trust Boundaries

## Overview

Trust boundaries define who can mutate what, what is read-only, and what is externalized. Understanding these boundaries is essential for reasoning about system security, correctness, and failure modes.

```
┌────────────────────────────────────────────────────────────────────┐
│                         Trust Boundaries                           │
│                                                                    │
│  ┌─────────────────────────────────────────┐                      │
│  │         EXECUTION BOUNDARY              │                      │
│  │  Pipeline stages, PipelineContext        │                      │
│  │  Can mutate: ctx.state, metrics         │                      │
│  │  Cannot mutate: snapshots, replay       │                      │
│  └──────┬────────────────────────┬─────────┘                      │
│         │                        │                                 │
│         ▼                        ▼                                 │
│  ┌─────────────┐       ┌────────────────┐                          │
│  │ PLUGIN      │       │ PROVIDER       │                          │
│  │ BOUNDARY    │       │ BOUNDARY       │                          │
│  │             │       │                │                          │
│  │ Read: ctx   │       │ Read: request  │                          │
│  │ Write: ctx  │       │ Write: nothing │                          │
│  │ state only  │       │ (transport)    │                          │
│  └─────────────┘       └────────────────┘                          │
│                                                                    │
│  ┌─────────────────────────────────────────┐                      │
│  │         STORAGE BOUNDARY                │                      │
│  │  Snapshots (write-once), Replay (read)  │                      │
│  │  SQLite (append-only), Filesystem (rw)  │                      │
│  └─────────────────────────────────────────┘                      │
└────────────────────────────────────────────────────────────────────┘
```

---

## Execution Boundary

### Scope

The execution boundary contains:
- Pipeline stages (built-in and plugin)
- `PipelineContext` (request, config, metrics, state)
- The pipeline execution loop (`pipeline.run()`)

### Who Can Mutate What

| Component | Can Mutate | Cannot Mutate |
|-----------|-----------|---------------|
| `collect` stage | `ctx.state`, `ctx.metrics` | `ctx.request.messages` |
| `measure` stage | `ctx.metrics` | `ctx.request`, `ctx.response` |
| `budget` stage | `ctx.state` | `ctx.config` |
| `summarize` stage | `ctx.state` | `ctx.request`, `ctx.response` |
| `prune` stage | `ctx.state` (decision metadata) | `ctx.request` (the messages array is read-only after collect) |
| `forward` stage | `ctx.response` (set the response) | Earlier stages' decisions |
| Plugin stages | `ctx.state` | `ctx.request`, `ctx.response` |
| Pipeline loop | `trace[]` (push results) | Stage order |

### Immutable Within Boundary

- `ctx.config` — pipeline configuration (cannot be changed by any stage)
- Stage order — fixed at construction
- `Pipeline` instance — stage array is sealed

### Enforcement

Enforcement is by convention, not by runtime checks. Pipeline stages are expected to follow the rules. Violations are programming errors, not security breaches.

---

## Plugin Boundary

### Scope

All plugin code: stages, analyzers, extensions.

### Allowed

| Action | Details |
|--------|---------|
| Read `ctx.request` | Observe the request |
| Read `ctx.metrics` | Observe token counts |
| Write to `ctx.state` | Add metadata (prefixed by plugin ID) |
| Return `StageResult` | Stage status and metadata |
| Provide extension data | Replay visualizations, dashboard widgets |

### Forbidden

| Action | Risk |
|--------|------|
| Modify `ctx.request.messages` | Changes what the provider sees |
| Modify `ctx.response` | Changes what the client receives |
| Write to filesystem | Could corrupt snapshots or storage |
| Access SQLite | Could read/modify annotation data |
| Call provider APIs | Bypasses routing, security, and pipeline |
| Access other plugins' data | Breaks isolation |
| Store credentials | Secrets leak if plugin is shared |

### Isolation Mechanism

Plugin isolation is **architectural, not sandboxed**. Plugins:
- Run in the same process.
- Have access to the full Node.js API.
- Are trusted not to violate conventions.

Future versions may provide stronger isolation (separate processes, WebAssembly, or capability restrictions).

---

## Provider Boundary

### Scope

Provider adapters: code that normalizes requests, sends HTTP, and normalizes responses.

### Allowed

| Action | Details |
|--------|---------|
| Read `ChatCompletionRequest` | The optimized request |
| Send HTTP requests | To the configured provider API |
| Return `ChatCompletionResponse` | Normalized response |
| Handle provider-specific errors | Map to standard error format |

### Forbidden

| Action | Risk |
|--------|------|
| Access pipeline state | Provider has no reference to `PipelineContext` |
| Modify the request | Request is already serialized |
| Access other providers' data | No cross-provider references exist |
| Write snapshots | No snapshot store reference |
| Log API keys | Security violation |

### Isolation Mechanism

The `InferenceProvider` interface is deliberately narrow:

```typescript
interface InferenceProvider {
  id: string
  chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse>
}
```

The adapter cannot access anything outside its `chat()` method. It receives a request and returns a response. That is the full API surface.

---

## Storage Boundary

### Scope

All persistent data: snapshots, replay artifacts, SQLite databases.

### Who Can Access

| Store | Read | Write | Delete |
|-------|------|-------|--------|
| Snapshots (filesystem) | SnapshotStore, API, CLI | SnapshotStore (write-once) | Direct file deletion |
| Replay artifacts (filesystem) | ReplayStore, API, CLI | ReplayStore (write-once) | Direct file/dir deletion |
| Annotations (SQLite) | AnnotationStore, API, CLI | AnnotationStore (append-only) | AnnotationStore (single row) |
| Request traces (SQLite) | Storage class, API | Storage class (append-only) | Not supported |
| Workspaces (filesystem) | WorkspaceStore, API | WorkspaceStore | WorkspaceStore |

### Externalization

External callers (HTTP API) can:
- Read snapshots and replay artifacts (GET endpoints).
- Create annotations (POST endpoints).
- Create workspaces (POST endpoints).

External callers cannot:
- Modify snapshots.
- Delete snapshots (no API endpoint — only direct filesystem access).
- Write to the request traces table.

---

## Boundary Violation Examples

| Violation | Boundary | Detection | Severity |
|-----------|----------|-----------|----------|
| Plugin modifies `ctx.request.messages` | Plugin → Execution | Not automatically detected | High — changes provider input |
| Adapter writes to filesystem | Provider → Storage | Not automatically detected | High — corrupts storage |
| Plugin reads another plugin's state | Plugin → Plugin | By naming convention (plugin ID prefix) | Medium — unexpected data |
| Snapshot modified after creation | Storage → Execution | Content hash mismatch | Medium — replay inconsistency |
| Plugin calls provider directly | Plugin → Provider | Not automatically detected | High — bypasses routing |

---

## Trust Model Summary

| Boundary | Trust Level | Rationale |
|----------|-------------|-----------|
| Built-in pipeline stages | High | Audited code, single responsibility |
| Plugin stages | Medium | User-supplied, same process, architectural isolation only |
| Provider adapters | Medium | External-facing, narrow interface, no pipeline access |
| HTTP API | Low | External input, validated via Zod schemas |
| Filesystem storage | High | Write-once, append-only, no concurrent access |
| SQLite | High | Single connection, no external access path |
| Client (OpenCode) | Low | Sends arbitrary requests, subject to validation |
| Provider API | None | External service, out of our control |
