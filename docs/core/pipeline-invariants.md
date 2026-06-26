# Pipeline Invariants

## Stage Ordering Rules

The pipeline is an ordered array of `PipelineStage` objects. The order is fixed at construction time and enforced by the `Pipeline` class.

### Static Order

Built-in stages have a canonical order:

```
0. collect
1. measure
2. budget
3. summarize
4. prune
5. dedupe
6. compress
7. retrieve
8. forward
```

This order is defined in `src/index.ts` where the pipeline is constructed:

```typescript
const pipeline = new Pipeline([
  collectStage,
  measureStage,
  budgetStage,
  summarizeStage,
  pruneStage,
  dedupeStage,
  compressStage,
  retrieveStage,
  forwardStage,
], reporter)
```

### Plugin Stage Insertion

Plugin stages can insert before or after any named built-in stage. They cannot reorder built-in stages.

```
Example: plugin stage "my-stage" with position="after" relativeTo="measure"

0. collect
1. measure
2. my-stage (plugin, inserted after measure)
3. budget
4. summarize
...
```

If two plugins target the same position, their relative order depends on registration order (first registered = first executed).

### What Is Forbidden

1. **Dynamic reordering at runtime.** The stage array is immutable after construction.
2. **A stage skipping another stage.** Execution is sequential.
3. **A stage running multiple times.** Each stage executes exactly once.
4. **Circular plugin dependencies.** The `PipelineStageRegistry` rejects duplicate names and cycles.

### What Happens When Order Changes

If you manually construct a pipeline with a different order:

```typescript
const pipeline = new Pipeline([
  forwardStage,  // forward before collect!
  collectStage,
  ...
])
```

The pipeline will execute in your specified order. The system does not enforce the canonical order at runtime. You have bypassed the invariant.

**To detect this:** The pipeline trace preserves stage execution order. If you see `forward` before `collect`, construction order was wrong.

---

## Noop Semantics

Every stage has two paths through execution: run or skip. Both are explicitly recorded.

### Skipped Stages

A stage is skipped when:

1. **Disabled by configuration.** The stage checks `ctx.config` and returns a skip result.
2. **No work to do.** The stage determines there is nothing to transform.

Skipped stages still emit a `StageResult`:

```typescript
{ stage: 'prune', status: 'skipped', meta: { reason: 'disabled by config' } }
```

### Noop Stages

A stage performs its work but the result is a no-op (nothing was transformed):

```typescript
{ stage: 'dedupe', status: 'noop', meta: { removed: 0, reason: 'no duplicates found' } }
```

Noop stages are not the same as skipped stages. A noop stage ran and found nothing to do. A skipped stage never ran at all.

### Why This Distinction Matters

- **Debugging:** "Skipped" vs "noop" tells you whether the stage was disabled or whether it ran with no effect. Both are valid but have different implications.
- **Metrics:** Skipped stages add no latency. Noop stages add minimal latency (the overhead of checking for work).
- **Audit:** A skipped stage means the pipeline configuration chose to disable it. A noop stage means the data didn't need it.

---

## Decision Layer Isolation

The decision layer (advisory scores, prune reasons, summary confidence) is strictly informational. Decisions are:

1. **Computed** during execution.
2. **Recorded** in trace metadata.
3. **Visible** in replay and analysis.
4. **Never used** to alter execution control flow.

### Why Isolation Matters

If decisions could alter execution, the system would have circular dependencies:

```
Execution produces decision
        ↓
Decision alters execution
        ↓
Different execution produces different decision
        ↓
Infinite loop or unpredictable behavior
```

By keeping decisions purely observational, the pipeline remains predictable:

```
Execution produces decision
        ↓
Decision recorded (no feedback to execution)
        ↓
Decision available for replay and analysis
```

### What Decisions Cannot Do

- Block the pipeline from running.
- Force re-execution of earlier stages.
- Change the provider that handles the request.
- Alter the stage execution order.
- Modify the snapshot after creation.

---

## Why Reorder Is Forbidden

### 1. Stage Dependencies

Stages depend on data produced by earlier stages:

| Stage | Depends On |
|-------|-----------|
| `measure` | `collect` (messages available) |
| `budget` | `measure` (token counts known) |
| `summarize` | `budget` (budget allocation known) |
| `prune` | `measure` (low-signal detection reads tokens), `summarize` (summary affects pruning hints) |
| `forward` | All prior stages (optimized request ready) |

If stages ran out of order, a stage would receive incomplete or missing data.

### 2. Causal Traceability

The pipeline trace is a sequential record. Analysing a trace requires knowing that stage N ran before stage N+1. If order varied, trace analysis would need to reconstruct the causal chain.

### 3. Plugin Safety

Plugin stages declare a position relative to a built-in stage. If built-in stages moved, plugin positions would be ambiguous or broken.

### 4. Reproducibility

Replay projects traces into timeline frames. If execution order varied between runs, the same snapshot could produce different timelines — breaking the determinism guarantee.

---

## Stage Result States

Every stage returns exactly one of four states:

| State | Meaning | Execution Continues? |
|-------|---------|---------------------|
| `ok` | Stage completed successfully and made changes | Yes |
| `noop` | Stage ran but made no changes | Yes |
| `skipped` | Stage chose not to run | Yes |
| `error` | Stage encountered a failure | Configurable — may continue or break |

### Error Propagation

By default, the pipeline continues after an error:

```typescript
for (const stage of stages) {
  const result = await stage.run(ctx)
  trace.push(result)
  // no break on error
}
```

This means:
- An error in `summarize` does not prevent `prune` from running.
- An error in the `forward` stage returns an error response to the client.
- Later stages run even if earlier stages failed (they work with whatever state is available).

**Why:** Pipeline stages are independent. A failure in one stage should not cascade to unrelated stages. The forward stage may succeed even if the summary stage failed.

---

## Invariant Enforcement Summary

| Invariant | Enforced By | Violation Consequence |
|-----------|------------|----------------------|
| Fixed stage order | Pipeline constructor (array order) | Incorrect trace order |
| Snapshot immutability | Write-once file API | Corrupted snapshot |
| No dynamic reorder | Stage array sealed after construction | — |
| Provider transport-only | Adapter has no pipeline access | Architecture violation |
| Decisions non-blocking | Pipeline does not check decision metadata | — |
| Stage independence | Pipeline continues after errors | Incomplete trace |
