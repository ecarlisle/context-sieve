# Trace Model

## Overview

Every pipeline execution produces a trace: an ordered array of `StageResult` objects, one per stage. The trace is the complete record of what each stage decided and why.

```
Pipeline execution
    │
    ▼
StageResult[] (one entry per stage, in execution order)
    │
    ▼
Embedded in RunSnapshot.pipelineTrace
```

## StageResult Structure

```typescript
interface StageResult {
  stage: string                                // stage name
  status: 'ok' | 'noop' | 'error' | 'skipped'
  decision?: {                                 // analyzer decision
    eligible: boolean
    confidence: number
  }
  meta?: Record<string, unknown>               // stage-specific metadata
}
```

### Fields

| Field | Always Present? | Description |
|---|---|---|
| `stage` | Yes | Name matching the pipeline stage definition |
| `status` | Yes | Execution outcome |
| `decision` | Sometimes | Set by `analyzeStage()` before stage runs |
| `meta` | Sometimes | Stage-specific data (token counts, errors, decisions) |

### Status Values

| Status | Meaning | Example |
|---|---|---|
| `ok` | Stage completed successfully | Forward returned response |
| `noop` | Stage was disabled or had no work | compress with config disabled |
| `error` | Stage threw or returned error | Provider connection failed |
| `skipped` | Stage was bypassed | (reserved for future use) |

## Metadata Patterns

Each stage writes specific metadata:

| Stage | Meta Fields | Example |
|---|---|---|
| measure | `tokens` | `{ tokens: 142 }` |
| budget | (none) | `{}` |
| summarize | `summaryId, keyPointsCount, confidence` | `{ summaryId: "sum-...", keyPointsCount: 3 }` |
| prune | `removedCount, shadowMode, advisoryInfluenceUsed` | `{ removedCount: 2, shadowMode: true }` |
| forward | `tokens, providerId, providerLatency, resolvedModel` | `{ providerId: "openai", tokens: 48 }` |

## Trace Completeness

Every stage that executes produces exactly one `StageResult`. The trace array length equals the number of stages in the pipeline (including disabled/noop stages). No stage can be omitted from the trace.

## Decision Attachment

Before each stage runs, `analyzeStage()` evaluates whether the stage should execute. This decision is attached to the `StageResult`:

```typescript
{
  stage: "prune",
  status: "noop",
  decision: { eligible: true, confidence: 0.3 },   // low confidence → noop
  meta: { removedCount: 0, shadowMode: true }
}
```

The decision field records the analyzer's output. The stage may still run differently based on runtime conditions.

## Trace vs Log

| Aspect | Trace | Log |
|---|---|---|
| Structure | JSON array | Free text |
| Completeness | Every stage | Best-effort |
| Persistence | Inside snapshot | Terminal buffer |
| Queryable | Yes (via API) | No (grep) |
| Replayable | Yes | No |
