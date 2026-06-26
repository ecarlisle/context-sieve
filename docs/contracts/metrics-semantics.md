# Metrics Semantics

## Overview

context-sieve records metrics at multiple levels: per-stage, per-run, and aggregated. Every metric has a defined computation method, known error characteristics, and cross-provider comparability constraints.

> **See also:** The [Metrics reference](../observability/metrics.md) for exposed metrics, CLI access, and the `GET /metrics` endpoint.

---

## Token Estimates

### Definition

Token estimates approximate the number of tokens in a message or conversation. They are used by the budget and prune stages to make decisions about which content to retain.

### How Computed

```typescript
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
```

This is a **heuristic**. It assumes 1 token ≈ 4 characters, which is a rough approximation for most LLM tokenizers (GPT models average ~3.5–4.5 characters per token, Claude models average ~3.5–4.0).

### Error Characteristics

| Source | Error Magnitude | Direction |
|--------|----------------|-----------|
| Character-based heuristic | ±15–30% from actual tokenizer count | Over or under |
| Language variability (CJK) | Can be 2–3× actual | Underestimates |
| Whitespace-heavy content | ±10–20% | Overestimates |
| Code content | ±5–15% | Usually overestimates |

### Comparability Across Providers

**Not comparable.** Each provider uses a different tokenizer. The character heuristic is a proxy, not a standard. Token estimates from different providers should not be compared directly.

### Heuristic vs Deterministic

**Heuristic.** The estimate does not use any provider's tokenizer. It is a fast approximation suitable for making prune/budget decisions but not for billing or precise measurement.

### When It Matters

- Prune stage uses token estimates to decide what to remove
- Budget stage uses token estimates to allocate context window
- Metrics recording uses token estimates for trend analysis (consistent across runs from the same source, so trends are meaningful)

---

## Latency

### Definition

Wall-clock time between stage start and stage completion, in milliseconds.

### How Computed

```typescript
const start = performance.now()
// ... stage work ...
const latency = performance.now() - start
```

### Error Characteristics

| Source | Error Magnitude | Direction |
|--------|----------------|-----------|
| `performance.now()` resolution | ±0.01ms | Negligible |
| System scheduling | ±1–10ms | Adds jitter |
| GC pauses | ±5–100ms | Adds spurious latency |
| High system load | ±10–500ms | Adds spurious latency |

### Comparability Across Providers

**Not directly comparable.** Latency includes network time, queue wait, and processing. Comparisons should account for:
- Geographic distance to provider endpoint
- Provider load at time of request
- Content size (larger = longer)

Only compare latencies for the same provider and similar content sizes.

### Heuristic vs Deterministic

**Deterministic measurement of a non-deterministic value.** The measurement is precise, but the value itself varies between runs due to external factors.

---

## Confidence

### Definition

Confidence scores represent the system's certainty about a decision. They are currently used by the summarize and prune stages to express how reliable their output is.

### How Computed

- **Summarize confidence:** Ratio of summary length to original content length. A summary that retains 100% of content has confidence 0 (no summarization occurred). A summary that retains 5% of content has confidence near 1.0 (high compression, high uncertainty about fidelity). The formula is `1 - (summaryLength / originalLength)`.
  
- **Prune confidence:** Ratio of removed content to input content. When prune removes no content, confidence is 0. When prune removes 80% of content, confidence is 0.8.

```typescript
function summarizeConfidence(original: string, summary: string): number {
  return 1 - (summary.length / original.length)
}

function pruneConfidence(removed: number, input: number): number {
  return removed / input
}
```

### Error Characteristics

| Source | Error Magnitude | Direction |
|--------|----------------|-----------|
| Length-based confidence is a proxy | Systematic | Underestimates fidelity |
| Semantic meaning not captured | Cannot measure | — |

### Comparability Across Providers

**Comparable in structure only.** Confidence scores use the same formula, but the input content varies. Confidence 0.8 on one request is not the same as confidence 0.8 on another. Within the same run, confidence scores are directly comparable across stages.

### Heuristic vs Deterministic

**Heuristic.** Confidence is calculated from length ratios, which do not capture semantic preservation. A perfect summary of the same length as the original gets confidence 0 — same as an empty summary. This is a known limitation.

---

## Divergence Score

### Definition

Divergence score measures how much the system's output differs from a reference output (typically from a golden run). It is used in regression detection.

### How Computed

```typescript
function divergenceScore(run: RunSnapshot, baseline: RunSnapshot): number {
  const tokenDelta = Math.abs(run.metrics.outputTokens - baseline.metrics.outputTokens)
  const maxTokens = Math.max(run.metrics.outputTokens, baseline.metrics.outputTokens)
  const tokenRatio = maxTokens > 0 ? tokenDelta / maxTokens : 0

  // Structural comparison: which stages ran, what they did
  const pruneDelta = (run.prune?.removed || 0) - (baseline.prune?.removed || 0)
  const summaryDelta = (run.summaries?.length || 0) - (baseline.summaries?.length || 0)

  return (tokenRatio * 0.5 + (pruneDelta / (baseline.prune?.removed || 1)) * 0.3 + (summaryDelta / (baseline.summaries?.length || 1)) * 0.2)
}
```

### Error Characteristics

| Source | Error Magnitude | Direction |
|--------|----------------|-----------|
| Token heuristic noise | ±0.05–0.15 | Random |
| Small baseline values | Large amplification | Overstates divergence |
| Content similarity not measured | Cannot quantify | Understates divergence |

### Comparability Across Providers

**Not comparable.** Divergence is computed against a specific baseline. Scores from different baselines are not comparable.

### Heuristic vs Deterministic

**Deterministic given the same inputs.** Given the same run and baseline, the divergence score is always the same. It is a pure function of the two snapshots.

---

## Regression Score

### Definition

Regression score aggregates divergence scores across multiple runs to detect systematic behavioral changes.

### How Computed

```typescript
function regressionScore(runs: RunSnapshot[], baselines: RunSnapshot[]): RegressionReport {
  const scores = runs.map((run, i) => divergenceScore(run, baselines[i]))
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length
  const maxScore = Math.max(...scores)
  
  return {
    averageDivergence: avgScore,
    maxDivergence: maxScore,
    affectedRuns: scores.filter(s => s > 0.1).length,
    severity: avgScore < 0.1 ? "low" : avgScore < 0.3 ? "medium" : "high"
  }
}
```

### Error Characteristics

| Source | Error Magnitude | Direction |
|--------|----------------|-----------|
| Compounds divergence errors | Same as divergence × N | Random |
| Small sample size (N < 5) | High variance | Unreliable |
| Outliers | Skews average | Overstates regression |

### Comparability Across Providers

**Comparable only within the same regression group.** Two regression reports from different provider groups are not comparable.

### Heuristic vs Deterministic

**Deterministic given the same inputs.** Pure function of two snapshot arrays.

---

## Metric Reference Table

| Metric | Type | Deterministic? | Cross-Provider Comparable? | Primary Use |
|--------|------|----------------|---------------------------|-------------|
| Token estimate | Heuristic | No | No | Prune/budget decisions |
| Latency | Measured | No | No (with caveats) | Performance monitoring |
| Confidence | Heuristic | Yes | Structural only | Decision trustworthiness |
| Divergence score | Computed | Yes | No | Regression detection |
| Regression score | Computed | Yes | Within group only | Trend analysis |

---

## What Developers Usually Misunderstand

**"Token estimates are accurate enough for billing."**
No. The character heuristic can be off by 30% or more. Token estimates are for internal decisions only. Never use them for billing.

**"Confidence 0.9 means the system is 90% sure."**
No. Confidence is a heuristic derived from length ratios. It does not represent statistical certainty. Two confidence 0.9 scores from different runs are not comparable.

**"Divergence score tells me the content changed."**
No. Divergence score tells you the structural metrics changed. Content may have changed without affecting the score, and vice versa.

**"Regression means something is broken."**
Not always. Regression signals structural change. It may be intentional (new feature, config change). Use regression to flag changes for review, not as a bug indicator.
