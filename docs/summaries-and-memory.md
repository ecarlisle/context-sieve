# Summaries and Memory

> **Note:** This content is now covered in [Pipeline Invariants](../docs/core/pipeline-invariants.md) and [Data Model](../docs/data/data-model.md). This file is retained for reference.

## Overview

The shadow summary system generates deterministic, rule-based summaries of conversation context. Summaries are extracted as parallel artifacts — they are stored and reported but never modify the request or response.

## Shadow summaries (v0.5+)

The summarize stage runs as part of every pipeline execution. It produces a `ShadowSummary` containing:

```typescript
interface ShadowSummary {
  id: string                    // Unique identifier (sum-{timestamp}-{random})
  sourceIds: string[]           // Message indices that contributed key points
  summary: string               // Concise text summary
  keyPoints: string[]           // Extracted factual/decision/constraint sentences
  confidence: number            // 0–1, ratio of extracted points to total sentences
}
```

### Key point extraction

The summarizer scans each message for sentences matching three patterns:

1. **Decisions** — contains words like `should`, `will`, `decided`, `propose`, `agree`
2. **Constraints** — contains words like `must`, `cannot`, `required`, `forbidden`
3. **Facts/definitions** — contains words like `is`, `refers`, `defined`, `contains`, `includes`

Sentences matching any pattern are added to the key points array. Non-matching sentences are discarded.

### Confidence scoring

```
confidence = min((keyPoints.length / totalSentences) * 1.5, 1.0)
```

A conversation rich in facts and decisions scores higher. Casual conversation with few extractable patterns scores lower.

## Storage

Summaries are persisted to SQLite in the `summaries` table:

```sql
CREATE TABLE IF NOT EXISTS summaries (
  id TEXT PRIMARY KEY,
  request_id TEXT,
  summary TEXT,
  key_points TEXT,
  confidence REAL,
  created_at INTEGER
)
```

Storage errors are silently caught — the pipeline continues without failing.

## Advisory influence (v0.6+)

The shadow summary feeds into the prune stage as advisory hints. Key points from the summary are compared against each message using word-overlap scoring, producing per-message `advisoryScore` values. These scores increase prune confidence but never trigger removal alone.

See [pruning-system.md](pruning-system.md) for details.

## Important constraints

- Summaries are **deterministic** — no ML, no embeddings, no LLM calls
- Summaries are **never injected** into the request context
- Summaries are **append-only** — each request generates a new summary row
- Summaries have no persistent identity across requests (future: may support cross-request memory via SQLite queries)

## Metrics

The `/metrics` endpoint exposes:

| Field | Description |
|-------|-------------|
| totalSummariesGenerated | Count of requests where a summary was produced |
| avgSummaryConfidence | Average confidence score across all summaries |
| totalAdvisoryInfluenceHits | Requests where advisory scoring found overlap (v0.6+) |
| advisoryInfluenceHitRate | Ratio of hits to advisory-evaluated requests (v0.6+) |
| averageAdvisoryScore | Mean highest advisory score per request (v0.6+) |
