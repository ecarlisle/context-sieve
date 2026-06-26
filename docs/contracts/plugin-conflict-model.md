# Plugin Conflict Model

## The Problem

Two plugins can legitimately target the same pipeline stage. For example:

- Plugin A enriches messages with metadata (inserts after `collect`)
- Plugin B filters messages by role (inserts after `collect`)

Both run at the same insertion point. Their interaction determines correctness.

---

## Types of Conflict

### Type 1: Order-Sensitive (same data, different transformations)

```
Plugin A: add metadata to messages
Plugin B: remove messages by role

Order A→B: metadata is added to all messages, then B removes some
Order B→A: B removes messages first, then A adds metadata to remaining
```

Both orders produce correct output, but the output differs. Neither is wrong — they are just different.

**Resolution:** The pipeline config specifies plugin order explicitly. The user chooses which order is correct for their use case.

### Type 2: Overlapping Transformations (same field, different values)

```
Plugin A: set message.priority = "high"
Plugin B: set message.priority = "low"
```

The later plugin wins. The set of values is determined by execution order.

**Resolution:** This is not a conflict — it's deterministic by registration order. If the user wants different behavior, they should not enable both plugins, or should change the order.

### Type 3: Incompatible (cross-purposes)

```
Plugin A: discard messages over 200 tokens
Plugin B: add expansion text to messages (increases token count)
```

Plugin B adds tokens, then plugin A discards some of the expanded messages. The combination may produce unexpected results.

**Resolution:** The system does not detect semantic incompatibility. The user is responsible for understanding their plugin combinations. The trace captures what happened — inspection can reveal unexpected interactions.

### Type 4: Side-Effect Collision (both write to external resource)

```
Plugin A: writes summary to SQLite
Plugin B: writes analysis to SQLite (same summary table, different columns)
```

Both plugins share the annotation store. They must coordinate on schema.

**Resolution:** Plugins use a shared annotation table via the SDK's `annotate()` function. The annotation store is append-only — plugins cannot overwrite each other's entries. Each annotation has a unique `(runId, stage, key)` tuple.

---

## Ordering Rules (Formal)

### Rule 1: Registration Order Is Binding

The order in which plugins appear in the configuration file is the order in which they execute at the same insertion point.

```yaml
# config/pipeline.yaml
plugins:
  - name: metadata-enricher   # runs first
  - name: role-filter         # runs second
```

### Rule 2: Plugin Stages at Different Points Do Not Conflict

A plugin at `after:collect` and a plugin at `before:forward` operate on different stages of the pipeline. They do not conflict even if they modify the same data.

```
[collect] [plugin-A] [measure] [budget] ... [retrieve] [plugin-B] [forward]
```

Plugin-A modifies after collect. Plugin-B modifies before forward. They both affect the final message, but their order is determined by the pipeline, not by each other.

### Rule 3: No Mutual Reordering

Plugin A cannot declare "I must run before plugin B." Plugin stages only declare position relative to built-in stages. If both target the same built-in, the config order resolves it.

### Rule 4: All Conflicts Are Resolved Statically

No conflict is resolved at runtime. The order is fully determined at pipeline construction time. Runtime conflict resolution would introduce non-determinism.

---

## Deterministic Resolution Strategy

### Step 1: Collect All Plugin Stage Registrations

```
Input: 
  plugin-a → after:measure
  plugin-b → after:measure
  plugin-c → before:forward
  plugin-d → start

Output:
  start:       [plugin-d]
  after:measure: [plugin-a, plugin-b]
  before:forward: [plugin-c]
```

### Step 2: Sort Each Group by Registration Order

```yaml
# Config order
plugins:
  - name: plugin-a
  - name: plugin-b
  - name: plugin-c
  - name: plugin-d

# Result
start:         [plugin-d]
after:measure: [plugin-a, plugin-b]  # a before b
before:forward:[plugin-c]
```

### Step 3: Interleave with Built-in Stages

```
Final pipeline order:
  [plugin-d] [collect] [measure] [plugin-a] [plugin-b] [budget] ... [retrieve] [plugin-c] [forward]
```

---

## Forbidden Behaviors

### Forbidden: Plugin Modifies Another Plugin

A plugin must not inspect, modify, disable, or unregister another plugin.

```typescript
// FORBIDDEN
ctx.plugins.get("other-plugin").disabled = true
```

### Forbidden: Plugin Declares Position Relative to Another Plugin

```yaml
# FORBIDDEN
position: "after:other-plugin"
```

Plugin positions are always relative to built-in stages:

```yaml
# CORRECT
position: "after:measure"
```

### Forbidden: Plugin Mutates Pipeline Stage Array

```typescript
// FORBIDDEN
ctx.pipeline.stages.splice(2, 1)  // remove a stage
```

### Forbidden: Plugin Bypasses Stage Order

```typescript
// FORBIDDEN
const result = ctx.pipeline.stages[5](input)  // call a stage directly
ctx.pipeline.stages[0](input)                  // run a previous stage again
```

### Forbidden: Plugin Skips Another Stage

```typescript
// FORBIDDEN
ctx.skip("prune")  // prevent a stage from running
```

---

## Conflict Detection

The system does **not** detect semantic conflicts. It detects structural conflicts at construction time:

| Conflict | Detection | Action |
|----------|-----------|--------|
| Same insertion point | Detected and logged | Executes in registration order |
| Invalid insertion point | Detected | Pipeline construction fails |
| Plugin declared twice | Detected | Duplicate registration ignored |
| Plugin modifies another | Not detected (forbidden) | Violation of isolation contract |

---

## What Developers Usually Misunderstand

**"The system will warn me if two plugins are incompatible."**
No. The system does not understand plugin semantics. It only enforces structural ordering rules. You must test plugin combinations.

**"I can make plugin A run before plugin B by changing plugin A's insertion point."**
Not reliably. Both should target the same insertion point. The order is determined by the config, not by the insertion point.

**"If two plugins target the same stage, one must be wrong."**
No. Multiple plugins at the same stage is normal. The pipeline executes them sequentially and their combined output is the ContextRequest for the next built-in stage.

**"Plugin order doesn't matter if plugins operate on different fields."**
Order always matters. The ContextRequest is a single object. Later plugins see the modifications of earlier plugins, even if they only modify fields they care about.
