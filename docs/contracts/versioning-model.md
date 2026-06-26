# Versioning Model

## Run Version Compatibility

### Current Version

context-sieve does not maintain an explicit snapshot schema version number. The snapshot format is implicitly versioned by its field set. Fields are additive — new versions may add fields but never remove or rename existing fields.

### Compatibility Rules

| Scenario | Snapshot Created By | Read By | Result |
|----------|-------------------|---------|--------|
| Same version | v1.0 | v1.0 | Full compatibility |
| Newer reader, older snapshot | v1.0 | v2.0 | Compatible — reader ignores unknown fields if any; v1.0 snapshots have no unknown fields from v1.0 |
| Older reader, newer snapshot | v2.0 | v1.0 | Partial — v2.0 fields are lost; v1.0 reader sees only v1.0 fields |
| Different branch | fork/v1 | v1.0 | Undefined — field semantics may differ |
| Manual edit | — | any | Undefined — depends on edit validity |

**Rule:** All versions must be able to read all snapshots created by earlier versions. New fields are added only as optional (e.g., `provider?` was added after the initial snapshot format). No field is ever removed.

---

## Schema Evolution Expectations

### Additive Changes Only

New fields are added as optional properties:

```typescript
// v1.0 snapshot
interface RunSnapshot {
  id: string
  timestamp: number
  request: { ... }
  response: { ... }
  metrics: { ... }
  pipelineTrace: StageResult[]
}

// v2.0 snapshot (adds optional fields)
interface RunSnapshot {
  id: string
  timestamp: number
  request: { ... }
  response: { ... }
  metrics: { ... }
  pipelineTrace: StageResult[]
  prune?: { ... }         // added in v2.0
  summaries?: { ... }      // added in v2.0
  advisory?: { ... }       // added in v2.1
  provider?: { ... }       // added in v2.1.1
}
```

### What Can Change

- **Adding optional fields.** Safe. Older readers ignore unknown fields.
- **Adding new stage types.** Safe. Pipeline trace can include new stage names. Older replay code ignores stages whose names it doesn't recognize.
- **Adding new annotation types.** Safe. New annotation types are ignored by older readers.

### What Cannot Change

- **Removing a field.** Would break older snapshots that contain the field.
- **Renaming a field.** Same as removal + addition.
- **Changing a field's type.** Would break all readers.
- **Making an optional field required.** Would break older readers that don't provide it.

### Migration Strategy

When a field must change:

1. Add the new field with a different name (e.g., `metrics_v2`).
2. Keep the old field for one major version cycle.
3. Remove the old field in the next major version.

This has not yet been needed. The system is young.

---

## Backward Compatibility Guarantees

### What Is Guaranteed

- Snapshots created by version N can be read by version N+1.
- Replay artifacts created by version N can be read by version N+1 (if the snapshot format is compatible).
- Annotations created by version N can be read by version N+1.
- The pipeline trace format (`StageResult[]`) is stable.

### What Is NOT Guaranteed

- Snapshots created by version N+1 can be read by version N. New fields are ignored, but the snapshot may reference stages or metadata the older version doesn't understand.
- Replay artifacts from version N+1 can be read by version N. Regenerate replay artifacts after a downgrade.
- Pipeline decisions are reproducible across versions. Pruning heuristics may change. Summary extraction may differ. Provider routing logic may evolve.

---

## How Old Runs Behave Under New Code

### Scenario: Snapshot Created by v1.0, Read by v2.0

```
Snapshot v1.0 fields:
  id, timestamp, request, response, metrics, pipelineTrace

v2.0 reader:
  Reads all v1.0 fields → works
  Looks for `provider` field → undefined (optional, handled)
  Looks for `prune` field → undefined (optional, handled)
  Result: Full compatibility
```

### Scenario: Snapshot Created by v2.0, Read by v1.0

```
Snapshot v2.0 fields:
  id, timestamp, request, response, metrics, pipelineTrace
  prune, summaries, advisory, provider

v1.0 reader:
  Reads all v1.0 fields → works
  Sees `prune` field → unknown key, ignored by JSON parser
  `prune` data is lost
  Result: Partial compatibility (prune data invisible)
```

### Scenario: Run Executed by v2.0, Inspected by v2.0 CLI

```
CLI v2.0 reads snapshot v2.0:
  All fields available
  Provider metadata displayed
  Prune decisions displayed
  Result: Full fidelity
```

---

## Version Identification

Snapshot files do not contain a version number. To determine the creating version:

1. **Check the field set.** Absence of `provider` suggests v2.1.0 or earlier. Presence suggests v2.1.1+.
2. **Check the git tag.** The snapshot file's modification timestamp may correlate with a release.
3. **Check the replay metadata.** Replay artifacts include a `meta.json` file that may contain version info (future feature).

### Recommendation

If you run multiple versions of context-sieve, store snapshots in version-specific directories:

```
data/
├── snapshots-v1/
├── snapshots-v2/
└── snapshots/
```

Or use the `CONTEXT_SIEVE_DATA_DIR` environment variable to switch between data directories per version.

---

## What Developers Usually Misunderstand

**"I can share snapshots between different versions freely."**
You can share forward (old → new) but not backward (new → old). New fields are silently dropped by older readers.

**"Upgrading context-sieve will re-process old snapshots."**
No. Snapshots are immutable. Upgrading the code does not modify old snapshots. New executions use the new code.

**"The snapshot has a version field I can check."**
Not yet. Future versions may add an explicit `snapshotVersion` field for reliable compatibility checking.

**"I can downgrade context-sieve and all my snapshots still work."**
Old snapshots work. New snapshots (created by the newer version) may have fields the old version doesn't understand. Those fields are silently dropped.
