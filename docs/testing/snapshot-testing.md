# Snapshot Testing

Snapshot validation answers "can history be trusted?"

## Core Invariants

1. **Immutability** — a captured snapshot must never be mutated after creation
2. **Required fields** — id, timestamp, request, response, metrics, pipelineTrace must always exist
3. **Round-trip fidelity** — JSON serialization → deserialization must produce an identical object
4. **Optional field completeness** — prune, summaries, advisory, provider, multiRun must be preserved when present

## Helper Functions

`tests/helpers/index.ts` provides:

```typescript
recordSnapshot(snapshot, path)   // Write snapshot to disk
loadSnapshot(path)               // Read snapshot from disk
compareSnapshot(a, b)            // Deep structural comparison
```

## What Snapshot Tests Validate

- All required fields are present after capture
- Pipeline trace is non-empty
- Each trace entry has stage, status, and decision
- Optional fields (prune, summaries, advisory, provider, multiRun) are preserved
- Serialization round-trip produces identical output
- Metrics delta = outputTokens - inputTokens
