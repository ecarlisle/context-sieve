# Observability Design

## What Is Observed

context-sieve observes **execution artifacts** — the inputs, decisions, and outputs of the pipeline. It does not observe the meaning or quality of those artifacts.

### Observed

| Artifact | Description | Captured In |
|----------|-------------|-------------|
| Request content | Messages, model, parameters | `RunSnapshot.request` |
| Pipeline stage order | Which stages ran and in what order | `RunSnapshot.pipelineTrace[].stage` |
| Stage decisions | Stage-specific metadata (prune count, confidence) | `RunSnapshot.pipelineTrace[].meta` |
| Token counts | Input/output/delta token estimates | `RunSnapshot.metrics` |
| Provider resolution | Which provider handled the request | `RunSnapshot.provider` |
| Response content | The provider's response text | `RunSnapshot.response` |
| Timing | Latency per request, per stage | Metrics, trace metadata |
| Errors | Stage failures and error messages | `StageResult.status: 'error'` |
| Annotations | User-added context | SQLite `annotations` table |

### NOT Observed

| Aspect | Why Not |
|--------|---------|
| Response quality | Requires semantic judgment; outside system scope |
| User intent | Not derivable from message text without inference |
| Provider behavior | External to the system; out of our control |
| Cross-session patterns | Each request is independent |
| Embeddings | No vector representations are computed or stored |
| Full telemetry | Not a general-purpose telemetry platform |

---

## Traces vs Logs vs Snapshots

Each observability mechanism has a different purpose and retention policy.

```
┌──────────────────────────────────────────────────────────────────┐
│                    Observability Mechanisms                       │
│                                                                  │
│  ┌───────────┐    ┌───────────┐    ┌───────────┐                │
│  │  TRACES   │    │   LOGS    │    │ SNAPSHOTS │                │
│  │           │    │           │    │           │                │
│  │ Per-stage │    │ Overall   │    │ Complete  │                │
│  │ decisions │    │ flow +    │    │ immutable │                │
│  │ + timing  │    │ errors    │    │ record    │                │
│  │           │    │           │    │           │                │
│  │ Stored in │    │ stdout/   │    │ JSON file │                │
│  │ snapshot  │    │ stderr    │    │ on disk   │                │
│  │           │    │           │    │           │                │
│  │ Retention:│    │ Retention:│    │ Retention:│                │
│  │ forever   │    │ terminal  │    │ until     │                │
│  │           │    │ buffer    │    │ deleted   │                │
│  └───────────┘    └───────────┘    └───────────┘                │
└──────────────────────────────────────────────────────────────────┘
```

### Traces

**What:** A `StageResult[]` array with one entry per pipeline stage. Each entry records:
- Stage name
- Status (ok / skipped / error)
- Stage-specific metadata
- Error message (if failed)

**When:** Produced during every pipeline execution.

**Where:** Stored inside `RunSnapshot.pipelineTrace`. Accessible via snapshot API and replay.

**Retention:** Forever — embedded in the snapshot.

### Logs

**What:** Formatted text output to stdout/stderr. Includes:
- Config loading
- Request start/completion
- Stage results
- Provider resolution
- Errors and warnings

**When:** Produced during execution and configuration loading.

**Where:** stdout/stderr. Captured in verbose mode (`--verbose`).

**Retention:** Terminal buffer only. Not persisted by default. Redirect to file to retain:

```bash
context-sieve --verbose > context-sieve.log 2>&1
```

### Snapshots

**What:** Complete JSON record of a single execution. Includes request, response, trace, metrics, and decisions.

**When:** Created after each pipeline execution.

**Where:** `data/snapshots/{id}.json`.

**Retention:** Until explicitly deleted.

### Comparison

| Attribute | Trace | Log | Snapshot |
|-----------|-------|-----|----------|
| Granularity | Per-stage | Per-event | Full execution |
| Persistence | In snapshot | Terminal buffer | JSON file |
| Size | ~1-5 KB | ~100 bytes per event | ~1-100 KB |
| Queryable | Yes (via snapshot API) | No (grep) | Yes (snapshot API) |
| Structured | Yes (JSON) | No (text) | Yes (JSON) |
| Replayable | Yes | No | Yes |

---

## Why This Is Not Telemetry-Only

context-sieve's observability is not "dump everything to a logging system and forget it." It is designed for **investigation**:

- **Replay:** You don't just see that the prune stage ran — you walk through each decision frame by frame.
- **Search:** You don't grep log files — you query structured metadata indexed by run ID.
- **Comparison:** You don't eyeball two requests — you diff their snapshots structurally.
- **Regression:** You don't guess whether behavior changed — you measure it across groups of runs.
- **Debugging:** You don't re-run with more logging — you inspect the existing snapshot with `context-sieve debug`.

The system treats observability as a first-class feature, not an afterthought bolted onto logs.

---

## Metrics Overview

In-memory metrics are collected by `MetricsCollector` and reset on restart:

```
Average input tokens:     142
Average output tokens:     48
Average latency:           842ms
Total requests:            128
Summaries generated:       45
Average confidence:        0.87
Prune advisories used:     32
Advisory hit rate:         71%
```

These are accessible via `GET /metrics` for real-time monitoring.

---

## Common Misconceptions

**"Logs contain everything I need to debug a run."**
No. Logs show the overall flow but miss per-stage decision details. Use the snapshot trace or the interactive debugger for detailed investigation.

**"I can reconstruct the full pipeline from the metrics endpoint."**
No. Metrics are aggregate counters. They tell you how many requests were processed, not what happened in any specific request. Use snapshots for per-request details.

**"Observability affects pipeline performance."**
Minimally. Capturing the trace is a `push()` to an array. Writing the snapshot is a single file write after execution completes. Metrics collection is integer arithmetic. The overhead is negligible compared to provider latency.

**"If the log doesn't show an error, the run was successful."**
A stage can return `status: 'ok'` with misleading metadata. Always inspect the trace, not just the log, to verify correctness.
