# Metrics

## Overview

context-sieve maintains in-memory counters for real-time observability. Metrics are collected by `MetricsCollector`, exposed via `GET /metrics`, and reset on process restart.

## Exposed Metrics

| Metric | Type | Description |
|---|---|---|
| `totalRequests` | integer | Number of requests processed since startup |
| `totalInputTokens` | integer | Sum of estimated input tokens across all requests |
| `totalOutputTokens` | integer | Sum of estimated output tokens across all requests |
| `averageLatencyMs` | integer | Mean request latency in milliseconds |
| `averageInputTokens` | float | Mean input tokens per request |
| `averageOutputTokens` | float | Mean output tokens per request |
| `totalSummariesGenerated` | integer | Number of summaries produced |
| `averageSummaryConfidence` | float | Mean confidence score of generated summaries (0.0–1.0) |
| `totalAdvisoryInfluenceHits` | integer | Number of times prune advisories influenced decisions |
| `advisoryInfluenceHitRate` | float | Fraction of requests where advisories were active |
| `averageAdvisoryScore` | float | Mean advisory score across scored requests |

## Access

```bash
curl http://localhost:3000/metrics
```

```json
{
  "requests": 128,
  "avgInputTokens": 142,
  "avgOutputTokens": 48,
  "avgLatencyMs": 842,
  "totalSummariesGenerated": 45,
  "avgSummaryConfidence": 0.87,
  "totalAdvisoryInfluenceHits": 32,
  "advisoryInfluenceHitRate": 0.71,
  "averageAdvisoryScore": 0.65
}
```

> **See also:** [Metrics Semantics](../contracts/metrics-semantics.md) for detailed computation methods, error characteristics, and cross-provider comparability.

## What Metrics Are NOT

- **Not persistent.** Reset on restart. For historical data, use snapshots.
- **Not per-request.** Aggregate only. For individual request details, inspect the snapshot.
- **Not provider-specific.** They count all requests, regardless of which provider handled them.

## Metric Boundaries

| Signal | Classification | Why |
|---|---|---|
| Token estimates | Heuristic | `content.length / 4` — not provider tokenizer |
| Latency | Deterministic | Wall clock ms |
| Summary confidence | Heuristic | Scaled by `keyPoints.length / sourceCount` |
| Advisory scores | Heuristic | Computed from message length and position |
| Request count | Deterministic | Integer counter |
