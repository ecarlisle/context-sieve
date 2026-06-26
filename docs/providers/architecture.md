# Architecture

## Three Layers

context-sieve is organized into three layers. Each layer has a single responsibility and communicates with its neighbors through well-defined interfaces.

```
┌─────────────────────────────────────────────┐
│            Execution Layer                   │
│  collect → measure → budget → summarize     │
│  prune → dedupe → compress → retrieve       │
│                                             │
│  Decides: what context to keep, what to     │
│  discard, what to summarize, what order     │
│  to send messages in.                       │
│                                             │
│  Pure context transformation — never        │
│  touches provider or transport code.        │
└──────────────────────┬──────────────────────┘
                       │
                       │ optimized request
                       ▼
┌─────────────────────────────────────────────┐
│            Provider Layer                    │
│  ProviderRegistry                            │
│                                             │
│  resolve(model, override?) → Provider       │
│                                             │
│  Decides: which provider handles this       │
│  request based on routing rules, model      │
│  name, and explicit overrides.              │
│                                             │
│  No context transformation — pure routing.  │
└──────────────────────┬──────────────────────┘
                       │
                       │ normalized request
                       ▼
┌─────────────────────────────────────────────┐
│            Inference Layer                   │
│  Provider Adapters                           │
│                                             │
│  OpenAI Adapter   → api.openai.com          │
│  Anthropic Adapter→ api.anthropic.com       │
│  Ollama Adapter   → localhost:11434         │
│  ...                                        │
│                                             │
│  Decides: HTTP transport, auth headers,     │
│  request/response format.                   │
│                                             │
│  Pure I/O — no routing, no transformation.  │
└─────────────────────────────────────────────┘
```

## Separation of Concerns

### Execution Layer (Pipeline)

The execution layer never knows which provider will handle the request. It works with two abstractions:

- `PipelineContext.request` — an OpenAI-compatible chat request
- `PipelineContext.response` — an OpenAI-compatible chat response

It optimizes the request content but has zero awareness of transport, auth, or provider-specific formats.

**Files:** `src/pipeline/`, `src/compression/`, `src/metrics/`

### Provider Layer (Router)

The provider layer is a directory service. Given a model name and an optional provider override, it returns the correct `InferenceProvider` instance. It:

- Loads provider configuration from YAML files
- Resolves environment variables in config values
- Matches model names against routing rules using glob patterns
- Falls back to the default provider if no rule matches

**Files:** `src/providers/registry.ts`, `src/providers/config/`

### Inference Layer (Adapters)

Each adapter translates the canonical `ChatCompletionRequest` into the provider's native API format, sends the HTTP request, and normalizes the response back to `ChatCompletionResponse`. Each adapter:

- Handles authentication (API key, no auth, custom headers)
- Maps model names if the provider uses different names
- Constructs provider-specific request bodies
- Parses provider-specific response bodies

**Files:** `src/providers/adapters/`, `src/providers/interface.ts`

## Sequence Diagram: Full Request

```
OpenCode         context-sieve          ProviderRegistry       Provider Adapter       Provider API
   │                    │                      │                     │                    │
   │  POST /v1/chat     │                      │                     │                    │
   │───────────────────▶│                      │                     │                    │
   │                    │                      │                     │                    │
   │                    │  pipeline.run(ctx)    │                     │                    │
   │                    │───┐                  │                     │                    │
   │                    │   │ collect          │                     │                    │
   │                    │   │ measure          │                     │                    │
   │                    │   │ budget           │                     │                    │
   │                    │   │ summarize        │                     │                    │
   │                    │   │ prune            │                     │                    │
   │                    │   │ dedupe           │                     │                    │
   │                    │   │ compress         │                     │                    │
   │                    │◄──┘                  │                     │                    │
   │                    │                      │                     │                    │
   │                    │  resolve(model)      │                     │                    │
   │                    │─────────────────────▶│                     │                    │
   │                    │                      │                     │                    │
   │                    │  ◀── provider ────── │                     │                    │
   │                    │                      │                     │                    │
   │                    │  provider.chat(req)  │                     │                    │
   │                    │───────────────────────────────────────────▶│                    │
   │                    │                      │                     │                    │
   │                    │                      │                     │  HTTP POST /v1/... │
   │                    │                      │                     │───────────────────▶│
   │                    │                      │                     │                    │
   │                    │                      │                     │  ◀─── response ─── │
   │                    │                      │                     │                    │
   │                    │  ◀── response ────── │                     │                    │
   │                    │                      │                     │                    │
   │  ◀── response ────│                      │                     │                    │
   │                    │                      │                     │                    │
```

## Why This Separation Matters

- **Testability** — Adapters can be tested with mock HTTP servers. The router can be tested with mock providers. The pipeline can be tested without any provider at all.
- **Swapability** — Add a new provider adapter without touching the pipeline or router. Change routing rules without modifying any code.
- **Observability** — Each layer emits its own metrics. You can measure pipeline overhead separately from provider latency.
- **Security** — The execution layer never sees API keys. The inference layer never sees message content decisions. Secrets stay in the config layer.

## Layer Boundaries (Invariants)

| Rule | Enforced by |
|------|-------------|
| Pipeline never calls a provider directly | Pipeline accepts only `PipelineStage[]`, not `InferenceProvider` |
| Router never transforms messages | `ProviderRegistry.resolve()` returns a provider, never modifies `ChatCompletionRequest` |
| Adapter never routes | Adapters don't inspect model names for routing decisions |
| Config never contains secrets in logs | `[REDACTED]` masking in the config loader |
