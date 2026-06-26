# Architecture

## Components

```
┌────────────────────────────────────────────────────────────────────┐
│                     MultiRunRunner                                  │
│                                                                     │
│  runAcrossProviders(request, providers[])                           │
│       │                                                            │
│       ├── for each provider:                                        │
│       │   ├── resolve provider from ProviderRegistry               │
│       │   ├── create isolated Pipeline instance                    │
│       │   ├── create isolated PipelineContext (deep-copied request)│
│       │   ├── pipeline.run(ctx)                                    │
│       │   ├── captureRunSnapshot(ctx, trace)                       │
│       │   ├── attach multiRun metadata { groupId, provider }       │
│       │   └── collect snapshot                                     │
│       │                                                            │
│       └── compareRuns(all snapshots) ──► ComparisonReport          │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

## Isolation Model

Each run is fully isolated:

| Aspect | Isolation Mechanism |
|--------|-------------------|
| Pipeline instance | New Pipeline() per run |
| Pipeline context | New PipelineContext() per run with deep-copied messages |
| State | New Map() per run — no shared state |
| Provider call | Independent HTTP call per provider |
| Snapshot | Independent captureRunSnapshot() per run |
| Errors | Independent — one provider failure does not affect others |

## No Shared State

```
Run A                          Run B
─────────                      ─────────
Pipeline A                     Pipeline B
Map state {}                   Map state {}
ctx.request (deep copy)        ctx.request (deep copy)
Provider A.chat()              Provider B.chat()
captureRunSnapshot()           captureRunSnapshot()
```

There is no:

- Shared pipeline instance
- Shared context or state
- Shared metrics collector
- Shared cache
- Shared connection pool

---

## Data Flow

```
1. Client sends request with providers[] list
         │
2. MultiRunRunner.runAcrossProviders()
         │
3. For each provider:
         │
         ├── Resolve provider from registry
         ├── Deep-copy request messages
         ├── Run isolated pipeline
         ├── Capture snapshot (with multiRun.groupId)
         └── Collect into runs[]
         │
4. compareRuns(runs[])
         │
         ├── Compute token variance (CV)
         ├── Compute latency variance (stddev)
         ├── Extract prune diffs per provider
         ├── Extract summary diffs per provider
         ├── Compute output diff (min/max/avg)
         ├── Compute provider ranking
         └── Aggregate divergence score
         │
5. Return MultiRunResult
```

## Snapshot Storage

Each snapshot is saved independently to the filesystem store (`data/snapshots/`). They are linked by `multiRun.groupId`:

```
data/snapshots/
├── snap-1740000000-abc1.json   (multiRun: { groupId: "mrun-...", provider: "openai" })
├── snap-1740000001-def2.json   (multiRun: { groupId: "mrun-...", provider: "anthropic" })
└── snap-1740000002-ghi3.json   (multiRun: { groupId: "mrun-...", provider: "openrouter" })
```

The group ID allows retrieving all runs for a comparison session.
