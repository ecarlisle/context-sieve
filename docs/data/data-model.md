# Data Model

## Entities

context-sieve defines six core entities. Every entity is immutable after creation (write-once). Annotations are the only exception — they are stored separately and overlaid at read time.

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Data Model Overview                          │
│                                                                      │
│  Execution                Storage                     Replay         │
│  ┌──────────┐           ┌────────────┐             ┌─────────────┐  │
│  │ Request   │───►──────►│RunSnapshot │────►───────►│TimelineFrame│  │
│  └──────────┘     │      └────────────┘      │      └─────────────┘  │
│                   │              │            │                       │
│                   │              ▼            │                       │
│                   │      ┌────────────┐      │                       │
│                   │      │ Annotation │──────┘                       │
│                   │      └────────────┘  (overlay at replay)         │
│                   │                                                  │
│                   │      Analysis                                    │
│                   │      ┌──────────────────┐                        │
│                   └─────►│RegressionReport  │                        │
│                          ├──────────────────┤                        │
│                          │BenchmarkReport   │                        │
│                          └──────────────────┘                        │
└──────────────────────────────────────────────────────────────────────┘
```

### RunSnapshot

A complete record of one pipeline execution.

```typescript
interface RunSnapshot {
  id: string                    // "snap-{timestamp}-{random}"
  timestamp: number             // epoch ms when execution completed
  request: {                    // original request (before transformation)
    model: string
    messages: ChatMessage[]
  }
  response: {                   // provider response (after transformation)
    id: string
    content: string
  }
  metrics: {                    // token usage
    inputTokens: number
    outputTokens: number
    delta: number
  }
  pipelineTrace: StageResult[]  // ordered list of stage results
  prune?: { ... }               // prune decision details (if stage ran)
  summaries?: { ... }           // summary details (if stage ran)
  advisory?: { ... }            // advisory scoring details (if available)
  provider?: {                  // provider resolution details
    id: string
    model: string
    latency: number
  }
}
```

**Lifecycle:**
1. Created by `captureRunSnapshot()` after pipeline execution.
2. Written to `data/snapshots/{id}.json` — write-once.
3. Read by replay, search, regression, and benchmark tools.
4. Never modified after creation.

### TimelineFrame

A single frame in the replay timeline. Frames map 1:1 to pipeline stages.

```typescript
interface TimelineFrame {
  index: number                 // position in the frame sequence
  stage: string                 // stage name (e.g., "prune")
  label: string                 // human-readable label
  reasoning: string             // why this decision was made
  status: 'ok' | 'skipped' | 'error'
  meta?: Record<string, unknown>
  annotations?: Annotation[]    // loaded at replay time from SQLite
}
```

**Lifecycle:**
1. Built from `RunSnapshot.pipelineTrace` during replay artifact generation.
2. Stored as filesystem JSON in `data/replay/`.
3. Loaded by the timeline debugger and API.
4. Never executed — pure projection of stored data.

### Annotation

User-added metadata overlaid on a timeline frame at replay time.

```typescript
interface Annotation {
  id: string
  runId: string
  frameIndex: number
  stage?: string
  author: string
  type: 'note' | 'question' | 'issue' | 'insight' | 'decision'
  content: string
  createdAt: number
}
```

**Lifecycle:**
1. Created via CLI (`context-sieve annotate`) or API.
2. Stored in SQLite `annotations` table — append-only.
3. Loaded and merged into `TimelineFrame.annotations` at replay time.
4. Never modifies the underlying `RunSnapshot`.

### Summary

Extractive summary produced by the summarize stage.

```
Summary
├── id: string
├── summary: string (condensed text)
├── keyPoints: string[] (extracted sentences)
├── confidence: number (0.0 - 1.0)
├── sourceCount: number (# of source messages used)
└── sourceIds: string[] (message IDs that contributed)
```

**Lifecycle:**
1. Produced by `summarize` stage during execution.
2. Stored inside `RunSnapshot.summaries`.
3. Consumed by prune stage (as pruning hints) and by replay (display).

### RegressionReport

Structural comparison between two groups of snapshots.

```typescript
interface RegressionReport {
  id: string
  baselineRunIds: string[]
  candidateRunIds: string[]
  severity: 'none' | 'low' | 'medium' | 'high'
  score: number                 // 0-100, higher is worse
  impactedStages: string[]
  signals: RegressionSignal[]   // specific detected regressions
}
```

**Lifecycle:**
1. Created on demand by `detectRegression()`.
2. Not persisted to disk — generated from stored snapshots.
3. Read-only analysis of execution data.

### BenchmarkReport

Structural quality score comparing two snapshots.

```typescript
interface BenchmarkReport {
  id: string
  score: number                 // 0-100, higher is better
  recommendation: 'keep' | 'review' | 'reject'
  metrics: {
    efficiency: { reductionPct: number }
    integrity: { preservedRatio: number }
    stability: { divergenceCount: number, regressionScore: number }
    performance: { processingOverheadMs: number }
  }
}
```

**Lifecycle:**
1. Created on demand by `benchmarkCompare()` or `benchmarkRunAgainstAverage()`.
2. Not persisted to disk — generated from stored snapshots.
3. Requires at least two snapshots to compare.

---

## Entity Relationships

```
RunSnapshot (1) ────has────> StageResult[] (N)
     │
     ├── (optional) ──> PruneDecision
     ├── (optional) ──> Summary
     ├── (optional) ──> AdvisoryScores
     └── (optional) ──> ProviderMetadata
     
Annotation (N) ────references────> RunSnapshot (1)
Annotation (1) ────attached to────> TimelineFrame (1)

TimelineFrame (N) ────derived from────> RunSnapshot (1)

RegressionReport (1) ────references────> RunSnapshot[] (N)
BenchmarkReport (1) ────references────> RunSnapshot[] (N)
```

---

## Lifecycle: Request to Retrieval

```
1. RECEIVE
   Client sends ChatCompletionRequest
        │
2. EXECUTE
   Pipeline runs: collect → measure → budget → ... → forward
        │
3. CAPTURE
   captureRunSnapshot(ctx, trace) → RunSnapshot
        │
4. PERSIST
   snapshotStore.saveSnapshot(snapshot) → filesystem (write-once)
        │
5. INDEX (optional)
   SearchIndex.buildIndex() indexes run metadata in memory
        │
6. REPLAY (on demand)
   ReplayStore builds TimelineFrame[] from snapshot
   AnnotationStore merges annotations into frames
        │
7. ANALYZE (on demand)
   Regression: detectRegression(baselineIds, candidateIds)
   Benchmark:  benchmarkCompare(runIdA, runIdB)
        │
8. RETRIEVE (on demand)
   Load snapshot by ID → inspect, diff, debug
```

---

## Common Misconceptions

**"I can edit a snapshot to fix a mistake."**
No. Snapshots are immutable records of what happened. If the execution was wrong, re-run the request and capture a new snapshot.

**"Annotations are stored inside the snapshot."**
No. Annotations are stored separately in SQLite. They are merged at read time. The snapshot never changes.

**"I can delete individual stage results from a snapshot."**
No. The snapshot is a single JSON file. Deletion removes the entire snapshot. If you need to exclude a stage, re-run with that stage disabled.

**"Regression reports are persisted."**
No. They are computed on demand from stored snapshots. Each call to `detectRegression()` produces a fresh report.
