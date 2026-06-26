# Truth Hierarchy

## System-of-Record Precedence

When two system components disagree about what happened during execution, one must be authoritative. context-sieve defines a strict truth hierarchy:

```
1. RunSnapshot (filesystem JSON)
   └─ authoritative source of what happened

2. PipelineTrace (inside RunSnapshot)
   └─ derived from stage execution, embedded in snapshot

3. Replay artifacts (data/replay/<id>/)
   └─ derived from RunSnapshot at build time

4. Metrics (in-memory counters)
   └─ aggregate data, may lose precision on restart

5. Logs (stdout/stderr)
   └─ human-readable, not structured, may omit details

6. Provider response (external)
   └─ not under our control, captured in snapshot content
```

**The RunSnapshot is always authoritative.** Every other artifact is either derived from it, aggregated from it, or subordinate to it.

---

## Why This Hierarchy Exists

### Snapshot Is Write-Once

The snapshot is created immediately after execution completes and is never modified. This gives it the highest integrity:

```
Execution produces data
        │
        ▼
Snapshot captures data atomically (write temp file + rename)
        │
        ▼
All reading and analysis derives from the snapshot
```

No other artifact has this write-once guarantee.

### Replay Is Derived

Replay artifacts are built from the snapshot at a later time. If the snapshot changes between replay generations, the replay artifacts change. The replay is a projection, not the source.

### Metrics Are Ephemeral

Metrics are aggregated in memory and reset on restart. They are useful for real-time monitoring but not for historical accuracy. If metrics disagree with snapshots, the snapshots are correct.

### Logs Are Incomplete

Logs are human-readable summaries. They are not guaranteed to contain every decision detail. The trace inside the snapshot is the complete record.

### Provider Response Is External

The provider's response is captured in `RunSnapshot.response.content`. What the provider returned is what happened — but we cannot verify it independently. The snapshot records what we received.

---

## Disagreement Resolution Rules

### Rule 1: Snapshot Overrides Replay

If replay shows different content than the snapshot:

**Resolution:** Regenerate replay artifacts from the snapshot.

```bash
rm -rf data/replay/<runId>
# Replay artifacts are regenerated on next debug/inspect
```

**Root cause:** Replay artifacts were built from an older version of the snapshot, or the snapshot was modified after replay was generated.

### Rule 2: Trace Overrides Logs

If a log says "stage pruned 3 messages" but the trace shows 5:

**Resolution:** Trust the trace. Logs are produced by the reporter, which may format or filter data. The trace is the raw `StageResult[]` array.

### Rule 3: Snapshot Content Overrides Provider

If the provider says it returned different content than what's in the snapshot (e.g., via an API call log):

**Resolution:** Trust the snapshot. The snapshot records what the adapter returned after normalization. If the adapter has a bug, the snapshot still records what was actually received by the client.

### Rule 4: Metrics Are Indicative, Not Authoritative

If metrics show 100 requests but there are only 80 snapshot files:

**Resolution:** Metrics may include in-flight or failed requests that didn't produce snapshots. The snapshot count is the authoritative count of completed, recorded executions.

---

## Examples

### Example 1: Replay Shows Wrong Stage Order

```
Snapshot pipelineTrace: [collect, measure, budget, forward]
Replay frames:          [collect, forward, measure, budget]
```

**Resolution:** Replay artifacts are corrupted. Delete and regenerate:

```bash
rm -rf data/replay/<runId>
context-sieve debug <runId>
```

### Example 2: Log Says "prune skipped" but Trace Shows "prune ok"

```
Log:    [pipeline] stage=prune status=skipped
Trace:  {stage: "prune", status: "ok", meta: {removed: 2}}
```

**Resolution:** Trust the trace. The log reporter may have an incorrect status mapping. The trace is the canonical record.

### Example 3: Provider Dashboard Shows Different Token Count

```
RunSnapshot.metrics.outputTokens: 142
Provider dashboard:                 156
```

**Resolution:** Token estimates are approximations. The provider dashboard uses the provider's own tokenizer, which may differ from context-sieve's estimation (`content.length / 4`). Neither is "wrong" — they use different methods. The snapshot records the proxy's estimate, not the provider's actual count (which the proxy may not have access to).

---

## What Developers Usually Misunderstand

**"I can reconstruct a snapshot from logs."**
No. Logs are incomplete summaries. They do not contain the full `pipelineTrace`, `request.messages`, or `response.content`. If a snapshot is lost, the execution is unrecoverable.

**"The replay is the source of truth."**
No. The snapshot is the source of truth. Replay is a derived view. Always check the snapshot if replay looks wrong.

**"Metrics and snapshots should always agree."**
They may disagree because metrics include failed/partial requests and snapshots only record completions. Metrics are also reset on restart.

**"If the provider response disagrees with the snapshot, the provider is right."**
The provider is not part of the system. The snapshot records what was received. If there is a discrepancy, it may be an adapter bug — but the snapshot is the system's truth.
