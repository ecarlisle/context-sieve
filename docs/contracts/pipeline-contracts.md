# Pipeline Contracts

## Stage Ordering Invariants

The pipeline has a fixed ordering that is established at construction time and must never change during execution.

### Built-in Pipeline Order

```
 1. collect     — gather input context
 2. measure     — estimate token usage
 3. budget      — decide token budget allocation
 4. summarize   — optionally summarize (shadow)
 5. prune       — optionally prune context (shadow)
 6. dedupe      — remove duplicate content
 7. compress    — compress retained content
 8. retrieve    — prepare final payload
 9. forward     — send to provider
```

### Invariant 1: Order Is Fixed

The relative order of built-in stages never changes. Stage 1 always runs before stage 2. Prune always runs before dedupe, regardless of configuration.

**Violation:** A plugin reorders stages. This is forbidden.

### Invariant 2: Order Is Set at Construction

The pipeline order is determined once, when `createPipeline()` is called. It cannot be modified during execution.

**Violation:** Code modifies the stage array after pipeline creation. This is a bug.

### Invariant 3: Plugin Stages Respect Insertion Points

Plugin stages declare an insertion point (before/after a built-in stage, or at start/end). The runtime inserts them at the declared point. A plugin cannot declare a relative position to another plugin — only to a built-in stage.

**Violation:** Plugin A tries to insert "after plugin B." This is not allowed. Plugin stages are only positioned relative to built-in stages.

---

## Noop Semantics

A stage may produce no results. This is expected and must be handled.

See [Pipeline Invariants: Noop Semantics](../core/pipeline-invariants.md#noop-semantics) for the full definition of noop vs skipped vs error.

### Stage Result States

Every stage returns exactly one of four states:

| State | `status` | Meaning | Execution Continues? |
|-------|----------|---------|---------------------|
| Completed | `ok` | Stage ran and made changes | Yes |
| Noop | `noop` | Stage ran but made no changes | Yes |
| Skipped | `skipped` | Stage was disabled or conditional | Yes |
| Error | `error` | Stage encountered a failure | Configurable — may continue or break |

### Contract-Specific Detail: Downstream Impact

Downstream stages key off metrics. A noop prune means dedupe still runs. A skipped prune means dedupe may receive all messages. Consumers must check `status` before interpreting `metrics`.

---

## Plugin Ordering Rules

### Rule 1: Insertion Points Only

Plugins declare insertion relative to built-in stages:

```typescript
{ stageId: "after:measure" }   // runs after measure, before budget
{ stageId: "before:forward" }  // runs after retrieve, before forward
{ stageId: "start" }           // runs before collect (rare)
{ stageId: "end" }             // runs after forward (rare)
```

### Rule 2: Conflicts Resolve by Registration Order

If two plugins both declare `"after:measure"`, the one registered first runs first:

```yaml
plugins:
  - name: plugin-a   # runs first
  - name: plugin-b   # runs second
```

### Rule 3: Plugin Stage Groups Are Not Interleavable

Two plugin stages inserted at the same point form an atomic group. No built-in stage can appear between them:

```
[collect] [measure] [plugin-a] [plugin-b] [budget] ...
```

plugin-a and plugin-b both run after measure. They run in registration order, then budget runs.

---

## Conflict Resolution in Pipeline Composition

### Type 1: Same Insertion Point

**Conflict:** Two plugins both register `after:measure`.

**Resolution:** Execute in registration order. The pipeline configuration explicitly lists plugin order. That order is binding.

### Type 2: Invalid Insertion Point

**Conflict:** Plugin declares `after:nonexistent-stage`.

**Resolution:** The pipeline builder throws at construction time. The pipeline is not created.

```bash
Error: Plugin "my-plugin" declares insertion point "after:nonexistent-stage" which does not exist
```

### Type 3: Circular Dependency

**Conflict:** Plugin A declares `before:measure` and plugin B declares `after:collect`. Both points are equivalent (between collect and measure), but there is no explicit dependency between plugin A and plugin B.

**Resolution:** No circular dependency exists unless plugins declare relative positions to each other (which is not allowed). Registration order resolves the sequence.

### Type 4: Stage Disabled

**Conflict:** A plugin declared `after:prune` but prune is disabled in the configuration.

**Resolution:** The pipeline logs a warning and the plugin stage is placed where prune would normally be:

```
Warning: Plugin "my-plugin" requested position "after:prune" but prune is disabled. Placing plugin at prune position.
```

This is a soft warning, not a hard error. The plugin still runs.

---

## Stage Isolation Rules

### Isolation Contract

- Stages receive the current `ContextRequest` and produce a modified copy
- Stages cannot access each other's internal state
- Stages cannot mutate the pipeline configuration
- Stages cannot register or unregister other stages

### Isolation Enforcement

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Stage 1     │────►│  Stage 2     │────►│  Stage 3     │
│              │     │              │     │              │
│  Input: A    │     │  Input: A+   │     │  Input: A++  │
│  Output: A+  │     │  Output: A++ │     │  Output: A+++│
└──────────────┘     └──────────────┘     └──────────────┘
        │                    │                      │
        │                    │                      │
        └───────── All state is passed ────────────┘
                   through ContextRequest
```

Each stage transforms ContextRequest. No stage sees another stage's private variables, file handles, or connections.

---

## What Developers Usually Misunderstand

**"Plugin stages can run in any order if I rename them."**
No. Order is determined by insertion point and registration order. Renaming a plugin does not change its position.

**"I can make a stage run conditionally based on what another stage did."**
No. This would violate stage isolation. A stage cannot inspect another stage's internal state. All communication is through ContextRequest.

**"If a stage is a noop, it's skipped."**
No. A noop stage still executes. It reports `status: "ok"` with zero metrics. Skipped stages have `status: "skipped"` and were never entered.

**"The pipeline order can change at runtime."**
No. The order is set at construction and is immutable during execution.
