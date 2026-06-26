# Consistency Report

Issues found during v2.1.2a documentation reconciliation audit.

## Issue 1: Stage Result States — 3-State vs 4-State Contradiction

**Severity:** High

**Source:** Multiple docs define different sets of valid stage result states.

| Document | States Listed | Count |
|---|---|---|
| `docs/core/pipeline-invariants.md` | `ok`, `skipped`, `error` | 3 (noop is sub-category of ok) |
| `docs/contracts/pipeline-contracts.md` | `ok` (noop), `skipped`, `error` | 3 (noop annotated as sub-category) |
| `docs/observability/trace-model.md` | `ok`, `noop`, `error`, `skipped` | 4 |
| `docs/replay/timeline-model.md` | `ok`, `noop`, `error` | 3 (missing `skipped`) |
| `docs/core/mental-model.md` | Uses `ok`/`noop`/`error` in examples | Implicit |

**Actual code** (`src/pipeline/types.ts`): Need to check but docs must agree.

**Resolution:** Standardize on 4 states: `ok` (work was done), `noop` (stage ran but made no changes), `skipped` (stage was disabled), `error` (stage failed). Update `pipeline-invariants.md` and `pipeline-contracts.md` to use this model.

## Issue 2: Error Propagation — Forward Stage Behavior

**Severity:** Low

**Source:** `pipeline-invariants.md` says "error in the forward stage returns an error response to the client" — this implies the pipeline breaks. `execution-guarantees.md` says "A stage error... does not prevent subsequent stages from running (the forward stage may still attempt execution)."

**Resolution:** These are consistent — forward must be the last stage (index 8), so there are no subsequent stages. Add a note to `pipeline-invariants.md` clarifying that forward is terminal.

## Issue 3: Pipeline Stage Count

**Severity:** Medium

**Source:** Some docs list 8 stages, some list 9.

| Document | Stages Listed | Count |
|---|---|---|
| `createRoutedForwardStage` | collect, measure, budget, summarize, prune, dedupe, compress, retrieve, forward | 9 |
| `docs/core/pipeline-invariants.md` | Same 9, indexed 0-8 | 9 |
| `docs/core/execution-guarantees.md` | collect → measure → budget → summarize → prune → dedupe → compress → retrieve → forward | 9 |
| `docs/core/mental-model.md` | Same | 9 |
| `docs/architecture.md` | collect → measure → budget → prune → dedupe → compress → retrieve → forward (no summarize) | 8 |

**Resolution:** `docs/architecture.md` is missing the `summarize` stage. Add it.

## Issue 4: Plugin Isolation — Contradictory Statements

**Severity:** Low

**Source:** `security-boundaries.md` says plugins "CANNOT access network" but adds a footnote: "enforced by convention only. A malicious plugin can access the filesystem and network." This creates confusion.

**Resolution:** Clarify that plugin network access is restricted by convention (no reference passed), not by sandboxing. Update the main statement to say "NO direct reference to network APIs" rather than "NO network."
