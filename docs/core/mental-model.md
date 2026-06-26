# Mental Model

## What context-sieve Is

context-sieve is a **deterministic context transformation and observability system** that sits between AI clients and inference providers. It is not an agent framework, not an LLM orchestration platform, and not a prompt optimizer.

It does one thing: intercept a chat completion request, apply a fixed pipeline of transformations, dispatch the optimized request to an inference provider, and record every decision made along the way for later replay, analysis, and audit.

```
execution → observation → replay → analysis → retrieval
```

## The Four Layers

### 1. Execution Layer

The execution layer runs the pipeline. It receives a `ChatCompletionRequest`, applies stages in fixed order, and produces a `ChatCompletionResponse` plus a trace of every stage result.

```
Input:  ChatCompletionRequest
        ↕
Pipeline: collect → measure → budget → summarize → prune → dedupe → compress → retrieve → forward
        ↕
Output: ChatCompletionResponse + StageResult[]
```

**Guarantees:**
- Order is fixed. Stages cannot be reordered dynamically.
- Each stage is either pure or explicitly side-effecting (storage writes, provider calls).
- The forward stage is the only stage that calls an external provider.
- Every decision is recorded in the trace.

### 2. Observation Layer

The observation layer captures execution artifacts and persists them. It does not execute anything. It receives the pipeline's `PipelineContext` and trace after execution completes and writes snapshots, metrics, and logs.

```
Execution completes
        ↓
Observation captures:
  • RunSnapshot (full request + response + trace)
  • Metrics (token counts, latency, compression ratio)
  • Logs (verbose output, stage timings)
        ↓
Storage: filesystem (snapshots, replay) + SQLite (annotations)
```

**Key invariant:** Observation never re-executes the pipeline. It reads what the execution layer produced and writes it to storage. It cannot alter execution decisions.

### 3. Replay Layer

The replay layer projects stored snapshots into timeline frames for interactive or programmatic review. It is a pure projection — it never re-runs the pipeline, never re-calls the provider, and never recomputes decisions.

```
Snapshot (immutable JSON on disk)
        ↓
Replay projection:
  • TimelineFrame[] (one per pipeline stage)
  • Causal chain (why each decision was made)
  • Annotations (user-added, stored in SQLite)
```

**Critical distinction:** Replay is NOT re-execution. The timeline frames you see in the debugger are derived from the snapshot at build time. They are deterministic — the same snapshot always produces the same replay.

### 4. Decision Layer

The decision layer is the audit trail. It answers "why did the pipeline do X?" by linking each pipeline decision (prune, summarize, compress) back to the evidence that triggered it.

```
Decision: "message[3] was pruned"
        ↕
Evidence: scorePruneCandidatesWithSummaryHints()
          advisory score = 0.87
          reason = "low signal content after summary"
        ↕
Stored in: trace metadata + snapshot.prune[]
```

The decision layer makes correctness observable. You can always trace a decision back to its input.

## What context-sieve Is NOT

See [What context-sieve Is Not](../core/what-it-is-not.md) for the complete reference. The summary: it is not an agent framework, LLM orchestrator, prompt optimizer, vector search, semantic engine, or agent runtime.

## Layered Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Client (OpenCode)                        │
│  Sends ChatCompletionRequest                                 │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Execution Layer                                             │
│                                                              │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐    │
│  │collect│→│measure│→│budget│→│summ. │→│prune │→│dedupe│... │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘    │
│           → compress → retrieve → forward                    │
│                                                              │
│  Produces: Response + StageResult[]                          │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ├──────────────────────────────────────┐
                        │                                      │
                        ▼                                      ▼
┌────────────────────────────────────┐  ┌──────────────────────────────┐
│  Observation Layer                  │  │  Inference Layer             │
│                                     │  │                              │
│  Captures:                          │  │  ProviderRegistry.resolve()  │
│  • RunSnapshot (immutable JSON)     │  │  → Adapter.normalize()       │
│  • pipelineTrace                    │  │  → HTTP POST to provider     │
│  • metrics                          │  │  → Adapter.denormalize()     │
│  • logs                             │  │                              │
└───────────────┬─────────────────────┘  └──────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│  Replay Layer                                                │
│                                                              │
│  Projects snapshot → TimelineFrame[]                         │
│  Pure derivation — no re-execution                           │
│                                                              │
│  Also reads: Annotations (SQLite, overlay only)              │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Analysis Layer                                              │
│                                                              │
│  Search (metadata indexing)                                  │
│  Regression (structural comparison)                          │
│  Benchmark (structural scoring)                              │
│                                                              │
│  All read-only — never mutate snapshots or replay artifacts  │
└─────────────────────────────────────────────────────────────┘
```

## Execution Is Not Re-execution

The single most important concept in context-sieve:

| Term | Meaning | Mutates? |
|------|---------|----------|
| **Execution** | Running the pipeline against a request | Yes — produces snapshots, traces |
| **Observation** | Capturing execution artifacts | Yes — writes to storage |
| **Replay** | Projecting stored artifacts into timeline frames | No — pure read |
| **Analysis** | Querying stored artifacts | No — pure read |
| **Retrieval** | Loading snapshots and replay artifacts by ID | No — pure read |

**If you need to understand what happened during a request, you use replay and analysis. You never re-execute.**

## Decision Traceability

Every decision in the pipeline has a traceable path:

1. **Input** → Stage receives `PipelineContext`
2. **Decision** → Stage applies logic (prune, summarize, etc.)
3. **Record** → Stage returns `StageResult` with `meta` containing evidence
4. **Persist** → `StageResult` is captured in `RunSnapshot.pipelineTrace`
5. **Replay** → Timeline frames display the decision and its evidence
6. **Verify** → You inspect the trace and confirm the decision matches the input

This chain is the foundation of system trust. You never need to guess why something happened.

## Common Misconceptions

**"Can I re-run a snapshot through the pipeline?"**
No. Snapshots are immutable records. Re-execution would produce a different result (different timestamps, potentially different pruning decisions). If you want to test with the same input, create a new request with the same messages.

**"Does replay need the provider?"**
No. Replay works entirely offline. It reads stored snapshots and projects them into frames. No network access, no API keys, no provider calls.

**"Can I modify a snapshot after execution?"**
No. Snapshots are write-once. If you need to add context, use annotations. Annotations are stored separately and overlaid on replay.

**"Is the pipeline deterministic across runs?"**
Within a single execution, yes — stage order is fixed and decisions are recorded. Across separate executions with the same input, decisions may differ due to timestamps, random seeds in pruning, or provider response variance.
