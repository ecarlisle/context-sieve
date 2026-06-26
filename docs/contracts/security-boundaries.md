# Security Boundaries

## Overview

Security boundaries define which components can access which data, under what conditions, and with what guarantees. This document expands the trust boundary model into explicit security contracts covering plugins, providers, secrets, and data access.

---

## Boundary Map

```
┌────────────────────────────────────────────────────────────────────────┐
│                        EXECUTION BOUNDARY                              │
│  Pipeline stages, PipelineContext, metrics                             │
│                                                                        │
│  ┌──────────────────┐       ┌──────────────────┐                      │
│  │ PLUGIN BOUNDARY  │       │ PROVIDER         │                      │
│  │                  │       │ BOUNDARY         │                      │
│  │ Read: ctx        │       │                  │                      │
│  │ Write: ctx.state │       │ Read: request    │                      │
│  │ (prefixed)       │       │ Write: response  │                      │
│  │ NO: snapshot     │       │ NO: pipeline     │                      │
│  │ NO: storage      │       │ NO: storage      │                      │
│  │ NO: network*     │       │ YES: HTTP to API │                      │
│  └──────────────────┘       └──────────────────┘                      │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                        STORAGE BOUNDARY                                │
│  Snapshots (write-once) | Replay (derived) | SQLite (append-only)     │
│                                                                        │
│  Accessible by: SnapshotStore, ReplayStore, AnnotationStore via API    │
│  NOT accessible by: plugins (convention), adapters (no reference)     │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                        NETWORK BOUNDARY                                │
│  HTTP API (inbound) | Provider API (outbound)                         │
│                                                                        │
│  Inbound: localhost:3000 (default), validated via Zod schemas         │
│  Outbound: HTTPS to provider APIs, HTTP to local providers            │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Plugin Data Access Scope

### What Plugins Can Read

| Data | Access | Rationale |
|------|--------|-----------|
| `ctx.request.messages` | Read-only | Plugin observes the conversation |
| `ctx.metrics` | Read-only | Plugin observes token counts |
| `ctx.state` | Read/write | Plugin shares metadata with other stages |
| `ctx.config` | Read-only | Plugin knows pipeline configuration |
| `pipelineTrace` | None (no reference) | Plugin doesn't see other stages' results |

### What Plugins Can Write

| Data | Access | Notes |
|------|--------|-------|
| `ctx.state` | Write (prefixed) | Key must be prefixed with plugin ID: `my-plugin/my-key` |
| `StageResult.meta` | Write | Plugin metadata for this stage only |

### What Plugins Cannot Access

| Data | Reason |
|------|--------|
| Other plugins' state keys | By convention — keys are prefixed with plugin ID |
| Snapshot files | No reference to SnapshotStore |
| SQLite database | No reference to AnnotationStore |
| Provider adapter instances | No reference to ProviderRegistry |
| Filesystem outside plugin directory | No restriction (by convention — trusted code) |
| Network (unrestricted) | No restriction (by convention — trusted code) |

### Plugin Data Access Diagram

```
Plugin code
    │
    ├── ✓ ctx.request.messages  (read)
    ├── ✓ ctx.metrics           (read)
    ├── ✓ ctx.state             (read/write, prefixed)
    ├── ✓ ctx.config            (read)
    │
    ├── ✗ SnapshotStore         (no reference)
    ├── ✗ AnnotationStore       (no reference)
    ├── ✗ ProviderRegistry      (no reference)
    ├── ✗ Other plugins' state  (no reference — convention prevents collision)
    ├── ✗ Filesystem            (no reference — but Node.js fs is available)
    └── ✗ Network               (no reference — but fetch is available)
```

**Note:** The last two items are enforced by convention only. A malicious plugin can access the filesystem and network. Review plugin code before deployment.

---

## Provider Isolation

### Scope of Access

Each provider adapter receives only what it needs:

```typescript
interface InferenceProvider {
  id: string
  chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse>
}
```

The adapter receives:
- The `ChatCompletionRequest` (optimized messages, model name, parameters)
- Its own `ProviderConfig` (baseUrl, apiKey, model)

The adapter does NOT receive:
- Pipeline state or metrics
- Any reference to other providers
- Any reference to storage (snapshots, SQLite)
- Any reference to plugins

### Cross-Provider Isolation

```
ProviderRegistry
    │
    ├── openai adapter
    │     └── config: { apiKey: "sk-xxx", baseUrl: "https://api.openai.com" }
    │
    ├── anthropic adapter
    │     └── config: { apiKey: "sk-ant-xxx", baseUrl: "https://api.anthropic.com" }
    │
    └── ollama adapter
          └── config: { baseUrl: "http://localhost:11434" }
```

No adapter can access another adapter's config. The registry passes only the matching config to each factory:

```typescript
case 'openai':
  return createOpenAIProvider(openaiConfig)  // only openai key
```

### Provider Cannot Access Storage

Adapters have no reference to:
- `SnapshotStore` (cannot write or read snapshots)
- `AnnotationStore` (cannot write or read annotations)
- `ReplayStore` (cannot generate replay artifacts)
- Filesystem paths (no storage paths in config)

The provider's sole purpose is transport. It sends a request and returns a response.

---

## Secrets Lifecycle

### Stages

```
1. ENVIRONMENT
   export OPENAI_API_KEY=sk-xxx
   export ANTHROPIC_API_KEY=sk-ant-xxx
       │
       │ loading
       ▼
2. CONFIG LOADER
   providers.yaml → YAML.parse() → env interpolation
   apiKey: ${OPENAI_API_KEY} → "sk-xxx"
       │
       │ secrets now in memory only
       ▼
3. PROVIDER CONFIG (in-memory)
   { apiKey: "sk-xxx", baseUrl: "...", model: "gpt-4" }
       │
       │ never written to disk
       ▼
4. ADAPTER (in-memory)
   Holds config reference for process lifetime
       │
       │ per-request usage
       ▼
5. HTTP REQUEST
   Authorization: Bearer sk-xxx
       │
       │ TLS-encrypted to provider API
       ▼
6. PROVIDER API
   Verifies and processes
```

### Persistence Rules

| Stage | Secret on disk? | Secret in memory? | Secret in logs? |
|-------|----------------|-------------------|-----------------|
| Environment variable | Yes (env) | Yes (process.env) | No (env not logged) |
| Config file | Yes (YAML with `${}`) | No (interpolated at load) | `[REDACTED]` |
| ProviderConfig | No | Yes | `[REDACTED]` |
| Adapter instance | No | Yes | Not included |
| HTTP request | No | In header, TLS-encrypted | Not included |
| Snapshot | No | No | Not included |
| Replay artifact | No | No | Not included |
| Annotation | No | No | Not included |

### Key Rotation

Keys are rotated by updating environment variables and restarting:

```bash
export OPENAI_API_KEY=<new-key>
# Restart context-sieve
```

There is no hot-reload for secrets. The process must restart to pick up new environment variables.

---

## Logging Restrictions

### What May Be Logged

```typescript
// ACCEPTABLE
console.log(`[pipeline] stage=prune status=ok removed=3`)
console.log(`[pipeline] stage=forward provider=openai model=gpt-4 latency=1234ms`)
console.log(`[metrics] run=snap-xxx tokens=142 latency=500ms`)
console.log(`[error] forward stage failed: HTTP 429 (rate limited)`)
```

### What Must NOT Be Logged

```typescript
// FORBIDDEN
console.log(`[config] openai apiKey=${cfg.apiKey}`)  // KEY IN LOG
console.log(`[request] full body=${JSON.stringify(req)}`)  // MAY CONTAIN KEYS IN HEADERS
console.log(`[response] raw=${rawResponse}`)  // MAY CONTAIN KEYS
```

### Enforcement

| Mechanism | Covers | Missing |
|-----------|--------|---------|
| Config loader `[REDACTED]` | Config loading logs | — |
| Code review | All logs | Pre-merge only |
| Post-processing scanner | CI/CD | Not real-time |

**If you see a secret in a log, it is a bug.** Report it immediately.

---

## Trust Boundaries Explicit

| Boundary | What Enters | What Leaves | Trust Model |
|----------|------------|-------------|-------------|
| **Execution** | Client request (from HTTP API) | Pipeline trace, snapshot | Trusted (audited code) |
| **Plugin** | Plugin code (user-supplied) | ctx.state, extension data | Semi-trusted (code review) |
| **Provider** | ChatCompletionRequest | ChatCompletionResponse | Untrusted (external service) |
| **Storage** | Snapshots, annotations | Read data | Trusted (write-once) |
| **Network (inbound)** | HTTP request | HTTP response | Untrusted (Zod validated) |
| **Network (outbound)** | Provider request | Provider response | Untrusted (external API) |

### Trust Escalation

A component in a lower-trust boundary cannot escalate to a higher-trust boundary:

- **Provider cannot escalate to execution.** Provider has no reference to pipeline internals.
- **Plugin cannot escalate to storage.** Plugin has no reference to SnapshotStore or AnnotationStore.
- **API caller cannot escalate to provider.** Caller cannot specify which provider credentials to use — routing is determined by config, not by the request.

### Trust Degradation

A failure in a higher-trust boundary degrades trust for that boundary:

- **If a plugin crashes:** Plugin boundary trust is degraded. Review or disable the plugin.
- **If a snapshot is modified:** Storage boundary trust is degraded. The snapshot is no longer authoritative.
- **If a log contains a secret:** Logging trust is degraded. Identify and fix the logging statement.

---

## What Developers Usually Misunderstand

**"Plugins are sandboxed and cannot access the filesystem."**
No. Plugins run in the same process with full Node.js API access. A plugin can `require('fs')` and read/write files. Plugin isolation is architectural, not sandboxed.

**"Provider adapters can see all configured API keys."**
No. Each adapter receives only its own config. The ProviderRegistry passes only the matching config to each factory function.

**"The HTTP API authenticates callers."**
No. The HTTP API binds to localhost by default and does not implement authentication. Authentication is deferred to the infrastructure level (reverse proxy).

**"Secrets are never in memory."**
Secrets are in memory during the process lifetime (in ProviderConfig objects held by adapters). They are not persisted to disk by context-sieve, but they exist in RAM.

**"Logging is safe because logs are local."**
Logs can be piped, redirected, or captured by monitoring systems. A secret in a log can propagate to log aggregation services, incident management platforms, and monitoring dashboards. Treat logs as potentially public.
