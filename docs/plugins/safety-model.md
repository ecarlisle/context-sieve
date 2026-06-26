# Safety Model

Plugins extend context-sieve under strict constraints. This document defines what plugins may and may not do.

## Allowed Operations

**Observe**
- Read pipeline context (request, metrics, config)
- Read snapshot data (replay extensions)
- Read stored runs (dashboard extensions)

**Annotate**
- Add metadata to stage results (analyzers)
- Enrich stage output with extension data

**Enrich**
- Provide overlay data for replay artifacts
- Compute derived values (e.g., token counts, heatmaps)

## Prohibited Operations

**Mutate Snapshots**
- Plugins must never modify stored `RunSnapshot` objects.
- Snapshot storage is append-only; plugins may not delete or update.

**Rewrite History**
- Plugins may not alter pipeline trace, decisions, or metrics after execution.
- Historical execution data is immutable.

**Bypass Pipeline**
- Plugins may not skip stages, short-circuit execution, or reorder stages beyond their declared `before`/`after` position.

**Modify Replay Artifacts**
- Replay data is an immutable projection of a snapshot.
- Plugins may add overlay data but never modify the base replay artifact.

**Alter Benchmarks or Regressions**
- Benchmark and regression data are computed from snapshots.
- Plugins may not insert, delete, or modify benchmark/regression entries.

## Enforcement

The plugin runtime enforces these constraints at the API boundary. Plugin extensions receive only the data they need:

| Extension Type | Receives | Cannot Access |
|---------------|----------|---------------|
| Stage | `PipelineContext` | Store, storage |
| Analyzer | `PipelineContext` | Anything beyond context |
| Replay | `RunSnapshot` (read-only) | Store, registry |
| Dashboard | `SnapshotStore` (read-only) | Mutation methods |
| Search | Snapshot list | Write operations |
