# Failure Semantics

## System Behavior Under Failure

context-sieve is an observability layer. Its primary responsibility is recording what happened — even (especially) when things go wrong. This document defines system behavior for every category of failure.

---

## Provider Fails Mid-Request

### Scenario

The pipeline reaches the forward stage. The provider adapter sends the request to the provider API. The provider returns an error, times out, or crashes.

### Behavior

```
1. Forward stage catches the error
2. Error details are recorded in forward's StageResult.error field
3. The forward stage returns with status: "error"
4. The pipeline completes (all previous stages succeeded)
5. The snapshot is created with:
   - response missing or partial (response.error set)
   - pipeline trace includes the error
6. The calling client receives the error
```

### What Is Persisted

- **StageResult with error:** Yes — full error message, status code, timestamp
- **Response content:** Partial — whatever was received before the failure
- **Metrics:** Yes — input tokens, latency to failure

### What Is Discarded

- **Provider connection state:** Connection is closed, not persisted
- **Retry state:** No automatic retry; caller is responsible

### Recovery Strategy

**No automatic recovery.** The caller receives the error and may retry. Each retry creates a new execution with a new snapshot. The failed snapshot remains for debugging.

```bash
# Inspect the failed snapshot
context-sieve inspect snap-failed123 --verbose
# Look at forward stage error
```

### Fallback Behavior

If a provider fails, the system does NOT fall back to another provider. The pipeline completes with an error. Fallback routing is the caller's responsibility.

---

## Snapshot Write Partially Fails

### Scenario

The pipeline completes. `captureRunSnapshot()` writes to disk. The write is interrupted (disk full, permission error, process killed mid-write).

### Behavior

```
1. captureRunSnapshot() builds the full snapshot object in memory
2. Writes to a temporary file (snap-<id>.tmp)
3. Renames temporary file to final name (snap-<id>.json)
4. If step 2 fails: temporary file is left on disk (will be cleaned on next startup)
5. If step 3 fails: temporary file exists, final file may be incomplete
```

### Atomic Write Guarantee

The rename operation (step 3) is atomic on most filesystems within the same partition. This means:

- **Partial writes never produce a visible snapshot.** If the write to the temp file is interrupted, the temp file is deleted or overwritten on next attempt. The final snapshot file either exists fully or not at all.
- **Snapshot existence means completeness.** If `snap-<id>.json` exists, it is a complete snapshot.

### What Is Persisted

- **Complete snapshot:** All fields, or none. No partial snapshots.
- **Metrics:** In-memory counters are incremented before the write. If the write fails, the counters reflect an attempted write, but no snapshot file exists.

### What Is Discarded

- **Failed write attempt:** Discarded. The snapshot is not created.
- **Memorized data from the failed write:** Discarded. The in-memory snapshot object is garbage collected.

### Recovery Strategy

**Retry the request.** The snapshot write was atomic — there is no partial state to recover.

```bash
# Clean up orphaned temp files
ls data/snapshots/*.tmp 2>/dev/null && rm data/snapshots/*.tmp
```

---

## Plugin Crashes

### Scenario

A plugin stage throws an unhandled exception during execution (null pointer, TypeError, out of memory).

### Behavior

```
1. Plugin stage throws
2. Pipeline runner catches the error
3. StageResult for the plugin is created with status: "error"
4. Error details are captured (stack trace, message, stage name)
5. The pipeline continues to the next stage
6. A failed stage does not block subsequent stages
```

### What Is Persisted

- **StageResult with error:** Yes — stack trace, error message, plugin name
- **All previous stages:** Successfully completed and captured
- **Subsequent stages:** Run with the ContextRequest from before the plugin

### What Is Discarded

- **Plugin internal state:** Discarded. The plugin's variables are lost (they're in the crashed process/vm module).
- **Plugin's intended output:** Discarded. The ContextRequest returned by a crashed plugin is undefined; the pipeline uses the input ContextRequest instead.

### Recovery Strategy

**The plugin is not retried.** The pipeline continues. The error is recorded for debugging.

```bash
# Find all snapshots where a specific plugin crashed
context-sieve search --stage-error "my-plugin"
```

### Fallback Behavior

When a plugin crashes, the pipeline proceeds with the input ContextRequest unchanged. This is equivalent to the plugin being a noop. Data integrity is maintained — the crash does not corrupt other stages.

---

## Replay Artifact Missing Fields

### Scenario

Replay reads a snapshot and generates frames. A required field (e.g., `content`) is missing from a StageResult in the snapshot.

### Behavior

```
1. Replay iterates pipelineTrace
2. Encounters StageResult with missing field
3. Fills missing field with a sentinel value: "[missing]"
4. Logs a warning (not an error)
5. Continues to the next frame
6. The replay completes — no frames are omitted
```

### What Is Displayed

- **Missing fields:** Shown as `"[missing]"` in the timeline UI
- **Preserved fields:** All present fields display normally
- **Frame index:** Present — the frame is not skipped

### Recovery Strategy

**The snapshot may be corrupted or created by a different version.** The replay is best-effort. The missing field data is unrecoverable.

```bash
# Verify snapshot integrity
context-sieve inspect <runId> --verbose
# Check the specific stage for missing fields
```

---

## Pipeline Interrupted

### Scenario

The process is killed (SIGKILL, power loss, OOM killer) during pipeline execution.

### Behavior

```
1. All in-memory state is lost
2. No snapshot is created
3. No metrics for the interrupted run are recorded
4. The client receives a connection error (if proxying) or no response
5. A partial temporary file may exist on disk
```

### What Is Persisted

- **Nothing from this run.** The snapshot was never created.
- **Previous runs:** Unaffected. Snapshots from earlier runs are on disk.

### What Is Discarded

- **Pipeline state:** Lost (in-memory)
- **Partial computation:** Lost
- **Provider response (if forward was in progress):** Lost

### Recovery Strategy

**No recovery for the interrupted run.** The caller must retry.

```bash
# Clean up orphaned temp files
ls data/snapshots/*.tmp 2>/dev/null && rm data/snapshots/*.tmp
# Metrics for the interrupted run don't exist
```

---

## Metrics Counter Overflow

### Scenario

The in-memory metrics counters overflow (theoretical — JavaScript uses 64-bit floats, so this is extremely unlikely).

### Behavior

```
1. Counter reaches Number.MAX_SAFE_INTEGER (9 quadrillion)
2. Further increments lose precision
3. No error is thrown
4. Counters become unreliable
```

**No recovery needed.** This would require 9 quadrillion requests without a restart.

---

## Failure Summary

| Failure | Snapshot Created? | Data Integrity | Recovery |
|---------|------------------|----------------|----------|
| Provider fails | Yes (with error) | Full — error recorded | Caller retries |
| Snapshot write fails | No | Atomic — no partial state | Caller retries |
| Plugin crashes | Yes (with error) | Full — other stages unaffected | Pipeline continues |
| Replay missing fields | N/A (replay) | Best-effort — sentinel values | None (data lost) |
| Pipeline interrupted | No | None | Caller retries |
| Metrics overflow | N/A (metrics) | Counter unreliable | Restart |

---

## What Developers Usually Misunderstand

**"If a plugin crashes, the whole pipeline fails."**
No. Only the plugin stage fails. The pipeline continues with the previous ContextRequest. Later stages are unaffected.

**"A failed snapshot write means data corruption."**
No. The write is atomic. Either the snapshot exists fully or not at all. There is no partial state.

**"I should handle provider failures in the pipeline code."**
No. Provider failures are recorded and passed to the caller. The pipeline is an observability layer, not a reliability framework. Automatic retry is the caller's responsibility.

**"If replay fails, I need to re-run the request."**
Not necessarily. If replay is missing fields, the snapshot may still be valid for inspection. Use the `inspect` command to view the snapshot directly.

**"A provider error snapshot is useless."**
No. It captures everything that happened before the failure. This is often more valuable for debugging than a successful run.
