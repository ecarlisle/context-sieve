# Terminology

## Standard Terms

This document defines the canonical terms for context-sieve documentation. All docs must use these terms consistently.

### Architecture

| Canonical Term | Also Known As | Definition |
|---|---|---|
| **Pipeline** | stage pipeline, transformation pipeline | Fixed ordered array of stages: collect → measure → budget → summarize → prune → dedupe → compress → retrieve → forward |
| **Stage** | pipeline stage, step | Single unit of pipeline work. Has a name, run function, and returns StageResult. |
| **Execution** | run, pipeline run, request | One invocation of `pipeline.run(ctx)`. Produces one snapshot. |
| **Replay** | timeline, debug view | Projection of a stored snapshot into timeline frames. Never re-executes. |
| **Snapshot** | RunSnapshot | Immutable JSON file recording one execution. System of record. |
| **Trace** | pipelineTrace | Ordered array of StageResult objects inside a snapshot. |
| **Timeline** | timeline frames | Sequence of TimelineFrame objects derived from a snapshot's trace. |

### Provider

| Canonical Term | Also Known As | Definition |
|---|---|---|
| **Provider** | inference provider, LLM provider | External API that receives the optimized request and returns a response. |
| **Adapter** | provider adapter | Factory function implementing `InferenceProvider` for a specific provider API. |
| **Registry** | ProviderRegistry | Maps provider IDs to adapter instances and routes models to providers. |
| **Route** | routing rule | Micromatch pattern + provider ID pair. Determines which provider handles a model. |
| **Resolution** | provider selection | The process of determining which provider handles a request: override → rules → default. |

### Pipeline Stages

| Canonical Term | Definition |
|---|---|
| **collect** | Gather input context |
| **measure** | Estimate token usage |
| **budget** | Decide token budget allocation |
| **summarize** | Extract key points (shadow mode by default) |
| **prune** | Remove low-signal content (shadow mode by default) |
| **dedupe** | Remove duplicate content |
| **compress** | Compress retained content |
| **retrieve** | Prepare final payload |
| **forward** | Send to provider via adapter |

### Stage Results

| Canonical Term | Definition |
|---|---|
| **ok** | Stage completed successfully. May be a noop (ran but made no changes). |
| **noop** | Stage ran but produced no transformations. Represented as `status: "ok"` with zero-effect metrics. |
| **skipped** | Stage was disabled or conditional — never entered. |
| **error** | Stage encountered a failure. Error details in meta. |

### Data

| Canonical Term | Also Known As | Definition |
|---|---|---|
| **RunSnapshot** | snapshot | Immutable JSON record of one execution. |
| **Annotation** | note | User-added metadata stored in SQLite, overlaid on timeline frames. |
| **TimelineFrame** | frame | Single element in the replay timeline. Maps to one StageResult. |
| **StageResult** | trace entry | Output of a single stage execution. |

### Analysis

| Canonical Term | Also Known As | Definition |
|---|---|---|
| **Diff** | snapshot comparison | Structural comparison of two snapshots. |
| **Benchmark** | quality scoring | Quality scoring against reference or average. |
| **Regression** | degradation detection | Detection of behavioral change across snapshot groups. |
| **Divergence** | structural difference | Numerical measure of difference between two runs. |

## Deleted Terms

The following terms have been replaced and must not appear in new documentation:

| Deprecated Term | Replacement | Reason |
|---|---|---|
| golden run | golden fixture | "Run" is ambiguous; "fixture" clarifies it is stored test data |
| debug mode | verbose mode | `--verbose` flag, not a separate mode |
| shadow summary | summarize | No separate concept — summarize stage produces summaries |
| pipeline run | execution | Consistent with execution-guarantees.md |
| record (noun) | snapshot | Snapshot is the specific term |
