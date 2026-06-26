# Cross-Layer Consistency

## The Problem

context-sieve maintains multiple representations of the same execution:

| Layer | Representation | Storage | Mutability |
|-------|---------------|---------|------------|
| Snapshot | `RunSnapshot` JSON | Filesystem | Immutable (write-once) |
| Replay | `TimelineFrame[]` | Derived from snapshot | Immutable (per generation) |
| Trace | `StageResult[]` | Inside snapshot | Immutable |
| Annotations | `Annotation[]` | SQLite | Append-only |
| Causal | `CausalLink[]` | Inside snapshot | Immutable |

When these layers disagree about what happened, the system must have a resolution strategy.

---

## Arbitration Rules

### Rule 1: Snapshot Always Wins

The snapshot is the system of record. Every other layer derives from it.

- If replay frames show different content than the snapshot's pipelineTrace, trust the snapshot.
- If annotations reference a frame that doesn't exist, the annotation is silently dropped.
- If the causal layer references a stage that doesn't exist, the causal link is dropped.

### Rule 2: Trace Overrides Derived Content

The pipeline trace inside the snapshot is a direct recording of execution. If external tools or logs contradict the trace, the trace wins.

- If a log says "stage X ran" but the trace has no entry for X, the trace is authoritative.
- If a log says "stage Y failed" but the trace says "stage Y succeeded", the trace wins.

### Rule 3: Annotations Are External Overlays

Annotations are not part of the snapshot. They are external metadata that reference the snapshot by `runId`. They do not affect replay correctness:

- Missing annotations: replay works, annotations absent
- Corrupted annotations: replay works, annotations omitted
- Conflicting annotations: not possible (append-only, no update)

### Rule 4: Replay Regeneration Resolves Disagreement

If replay and snapshot disagree, regenerate the replay artifacts. Replay is deterministic from the snapshot. If regeneration produces the same disagreement, the snapshot is the source of truth for content and the replay is the source of truth for display.

---

## Precedence Model

```
Authoritative (source)
   │
   ▼
RunSnapshot.pipelineTrace[]  ← high
RunSnapshot.response          ← high
RunSnapshot.metrics           ← high
   │
CausalLink[]                  ← medium (derived from pipelineTrace)
TimelineFrame[]               ← medium (derived from pipelineTrace)
   │
Annotation[]                  ← low (external overlay)
Logs                          ← low (human-readable summary)
Metrics (in-memory)           ← low (may include incomplete runs)
   │
   ▼
Authoritative for aggregate only
```

### High Precedence

Used for all system-level decisions and replay truth.

### Medium Precedence

Used for display and analysis. If they disagree with high-precedence data, they are regenerated.

### Low Precedence

Used for debugging and monitoring. Never used for system-level decisions. If they disagree with higher layers, they are ignored.

---

## Disagreement Resolution Matrix

| Disagreement | Location A | Location B | Resolution | Action |
|-------------|-----------|-----------|------------|--------|
| Stage count mismatch | `pipelineTrace` length = 9 | Replay shows 8 frames | Snapshot wins | Regenerate replay artifacts |
| Token count mismatch | Snapshot metrics | Replay frame stats | Snapshot wins | Replay stats are derived from different version |
| Annotation references frame 99 | Annotation in SQLite | pipelineTrace has 9 frames | Snapshot wins | Annotation silently dropped |
| Causal link references missing stage | CausalLink[] | pipelineTrace | Snapshot wins | Causal link dropped during read |
| Stage result differs | Snapshot trace | In-memory metrics | Snapshot wins | Metrics from a different run |
| Response content differs | Snapshot | Provider dashboard | Snapshot wins | Provider dashboard uses different estimate |

---

## Cross-Layer Consistency Enforcement

### At Snapshot Creation Time

```typescript
function captureRunSnapshot(run: RunContext): RunSnapshot {
  const snapshot = buildSnapshot(run)
  
  // Cross-layer validation at creation time
  assert(snapshot.pipelineTrace.length > 0, "Pipeline trace must not be empty")
  assert(snapshot.metrics.inputTokens >= 0, "Input tokens must be non-negative")
  assert(snapshot.metrics.latency >= 0, "Latency must be non-negative")
  
  // Causal links must reference actual stages
  if (snapshot.causal) {
    const stageNames = new Set(snapshot.pipelineTrace.map(s => s.stage))
    for (const link of snapshot.causal) {
      assert(stageNames.has(link.fromStage), `Causal link references unknown stage: ${link.fromStage}`)
      assert(stageNames.has(link.toStage), `Causal link references unknown stage: ${link.toStage}`)
    }
  }
  
  return snapshot
}
```

### At Replay Build Time

```typescript
function buildReplayFrames(snapshot: RunSnapshot): TimelineFrame[] {
  return snapshot.pipelineTrace.map((stage, index) => ({
    stage: stage.stage,
    status: stage.status,
    // ... frame fields derived from stage result
  }))
  
  // No cross-layer validation needed — replay is derived from snapshot
  // If the snapshot is valid, replay is valid
}
```

### At Annotation Read Time

```typescript
function getAnnotationsForRun(runId: string, db: AnnotationStore): Annotation[] {
  const annotations = db.query("SELECT * FROM annotations WHERE runId = ?", [runId])
  
  // Filter out annotations that reference nonexistent frames
  return annotations.filter(a => a.frameIndex < snapshot.pipelineTrace.length)
}
```

---

## "Source of Truth" Resolution

### Question: What actually happened during this execution?

**Answer:** The `RunSnapshot.pipelineTrace` is the complete, ordered record of every stage that ran and what each stage produced.

**How to answer:**
```bash
context-sieve inspect <runId> --verbose
# Read the pipelineTrace array
```

### Question: What did the provider return?

**Answer:** `RunSnapshot.response.content` is the normalized response as recorded by the adapter.

**How to answer:**
```bash
context-sieve inspect <runId> --verbose | jq '.response.content'
```

### Question: Did the prune stage run correctly?

**Answer:** Check `RunSnapshot.pipelineTrace` for the prune stage entry. It contains `metrics.removed`, `metrics.input`, `metrics.output`, and any `reasons` array.

**How to answer:**
```bash
context-sieve inspect <runId> --verbose | jq '.pipelineTrace[] | select(.stage == "prune")'
```

### Question: Are annotations displayed in replay accurate?

**Answer:** Annotations are loaded from the SQLite store. They are external to the snapshot. If replay shows annotations, they existed in the store at replay time. If the store was reset, annotations are gone — but the snapshot is unaffected.

---

## What Developers Usually Misunderstand

**"Annotations are part of the snapshot."**
No. Annotations are stored in a separate SQLite database. The snapshot is self-contained. Deleting the annotation store does not affect snapshots.

**"Replay and the snapshot should always match."**
Replay is derived from the snapshot. If the snapshot hasn't changed, replay should produce the same output every time. If they don't match, the replay artifacts are stale or corrupted — regenerate them.

**"Causal links are the same as pipeline traces."**
No. Causal links express semantic relationships between stages. The pipeline trace expresses the temporal order. A causal link may connect stage 1 to stage 9, skipping intermediate stages. The pipeline trace always shows every stage in order.

**"If one layer is wrong, the system is broken."**
Not necessarily. Layers serve different purposes. A missing annotation is not a system failure. A corrupted replay artifact is not a pipeline failure. Only snapshot corruption is a serious problem.
