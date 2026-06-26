# Replay Boundaries

## Replay vs Execution: Formal Definition

**Replay is a deterministic projection of a stored snapshot.** It is not re-execution. This boundary is the single most important contract in the system.

```
EXECUTION                          REPLAY
──────────                        ──────
Active computation                Pure read
Pipeline stages run               No stages run
Provider called                   No network
Snapshot created                  Snapshot consumed
Time: real (100ms–10s)            Time: near-zero (<5ms)
Side effects: writes to storage   Side effects: none
Determinism: per run only         Determinism: absolute
```

---

## Replay Assumptions

Replay makes five assumptions. If any are violated, replay output is undefined.

### Assumption 1: Snapshot Is Valid JSON

The snapshot file must be parseable as a `RunSnapshot`. If the file is truncated, corrupted, or manually edited with invalid syntax, replay fails with a JSON parse error.

**Violation signal:**
```
Error: Unexpected token in JSON at position 1234
```

**Recovery:** The snapshot is unrecoverable. Re-run the request.

### Assumption 2: Snapshot Has pipelineTrace

Replay requires `RunSnapshot.pipelineTrace` to be a non-empty array of `StageResult`. If it is missing or empty, replay produces zero frames.

**Violation signal:** Replay shows "no frames available."

**Recovery:** The snapshot was captured without a trace. This should not happen — check `captureRunSnapshot()` logic.

### Assumption 3: Snapshot Timestamps Are Monotonic

Replay assumes that `StageResult` entries in `pipelineTrace` are ordered chronologically (each stage started after the previous one). This is guaranteed by sequential pipeline execution.

**Violation signal:** Frame timestamps appear out of order (e.g., frame 3 has an earlier timestamp than frame 2).

**Recovery:** This would indicate a bug in pipeline execution or trace capture. Do not trust the replay ordering.

### Assumption 4: Annotation Store Is Separate

Replay merges annotations from SQLite at read time. It assumes the annotation store is independent and its absence does not affect frame content.

**Violation signal:** Missing annotations.

**Recovery:** Check that `AnnotationStore` is initialized with the correct SQLite database file. Annotations are optional — frames still display without them.

### Assumption 5: No External State Is Needed

Replay does not call any provider, access any network resource, or require any configuration file. Everything it needs is in the snapshot.

**Violation signal:** Replay hangs or attempts network access.

**Recovery:** This is a bug. Replay code must never make network calls. Report it.

---

## Provider Variability Effects

The provider's response is captured in the snapshot. Replay displays this captured response. It does not call the provider again.

### What This Means

- **Replay always shows the original response.** Even if the provider has changed its behavior since the original execution, replay shows what was returned at that time.
- **Replay is immune to provider outages.** If the provider is down, replay still works.
- **Replay is immune to provider API changes.** If the provider changes its response format, the stored snapshot is unaffected.

### What This Does NOT Mean

- **Replay cannot detect provider-side changes.** If the provider would return a different response today, replay doesn't know. It shows the historical response.
- **Replay cannot verify the provider's response.** It trusts the snapshot's `response.content` field without independent verification.

---

## Why Replay Is Not Recomputation

Re-execution would produce different results for fundamental reasons:

| Reason | Why Different |
|--------|---------------|
| **Timestamps** | New execution = new wall-clock time |
| **Random seeds** | Prune stage may use randomization |
| **Provider response** | Provider may return different content |
| **Pipeline config** | Config may have changed since original execution |
| **Plugin set** | Different plugins may be enabled |
| **Version** | Pipeline code may have changed |

Replay avoids all of these by projecting stored data. The result is deterministic and verifiable.

---

## Failure Examples

### Failure 1: Snapshot File Missing

```
context-sieve debug snap-abc123
Error: Snapshot not found: snap-abc123
```

**Root cause:** Snapshot file was deleted, moved, or never created.

**Resolution:** The execution is lost. Re-run the request to create a new snapshot.

### Failure 2: Snapshot Format Changed

```
context-sieve debug snap-abc123
Error: Unknown field "newField" — snapshot may be from a newer version
```

**Root cause:** Snapshot was created by a newer version of context-sieve and contains fields the current version doesn't recognize.

**Resolution:** Upgrade context-sieve to the version that created the snapshot, or accept that some fields are ignored.

### Failure 3: Replay Artifacts Out of Sync

```
Replay frame 4 shows "prune removed 3 messages"
Snapshot pipelineTrace shows "prune removed 5 messages"
```

**Root cause:** Replay artifacts were built from an older snapshot (before modification) or a different snapshot version.

**Resolution:** Delete replay artifacts and regenerate:

```bash
rm -rf data/replay/snap-abc123/
context-sieve debug snap-abc123
```

### Failure 4: Annotations Reference Nonexistent Frame

```json
{"runId": "snap-abc123", "frameIndex": 99}
```

**Root cause:** The annotation references a frame index that doesn't exist in the snapshot's pipeline trace (snapshot has only 9 stages, annotation references frame 99).

**Resolution:** Annotations with out-of-range `frameIndex` are silently dropped during replay. They remain in SQLite but are not displayed.

---

## Replay Boundary Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│                        EXECUTION SIDE                               │
│                                                                     │
│  Client Request                                                     │
│       │                                                             │
│       ▼                                                             │
│  Pipeline ──► Provider ──► Response                                 │
│       │                                                             │
│       ▼                                                             │
│  captureRunSnapshot() ──► RunSnapshot.json                          │
│                             │                                       │
│                             │ DATA BOUNDARY                          │
└─────────────────────────────┼───────────────────────────────────────┘
                              │
┌─────────────────────────────┼───────────────────────────────────────┐
│                        REPLAY SIDE                                  │
│                             │                                       │
│                             ▼                                       │
│  Read RunSnapshot.json                                              │
│       │                                                             │
│       ├── pipelineTrace[] ──► TimelineFrame[] (required)           │
│       ├── annotations (optional, from SQLite)                       │
│       └── ...other fields (ignored by replay)                       │
│       │                                                             │
│       ▼                                                             │
│  Timeline displayed to user                                         │
│                                                                     │
│  NO: network calls, provider access, pipeline re-execution,         │
│      config loading, plugin loading, metric recording               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## What Developers Usually Misunderstand

**"Replay is a second execution with the same inputs."**
No. Replay reads stored data. It does not execute anything. If you need to re-execute, create a new request.

**"Replay can fail because the provider is down."**
No. Replay never contacts the provider. The response is stored in the snapshot.

**"If I delete the replay artifacts, the snapshot is also deleted."**
No. Replay artifacts are derived data. Deleting them does not affect the snapshot. New artifacts are regenerated on next access.

**"Replay shows real-time data."**
No. Replay shows historical data from the snapshot. It is a recording, not a live feed.
