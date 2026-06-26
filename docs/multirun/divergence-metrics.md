# Divergence Metrics

## Token Variance

### Definition

Coefficient of variation (CV) of output token estimates across providers.

### Formula

```typescript
function tokenVariance(runs: RunSnapshot[]): number {
  const tokens = runs.map(r => r.metrics.outputTokens)
  const mean = tokens.reduce((s, v) => s + v, 0) / tokens.length
  const variance = tokens.reduce((s, v) => s + (v - mean) ** 2, 0) / tokens.length
  return mean > 0 ? Math.sqrt(variance) / mean : 0
}
```

### Interpretation

- **CV < 0.1**: Low token variance — providers output similar lengths
- **CV 0.1–0.3**: Moderate variance — some providers produce notably longer/shorter outputs
- **CV > 0.3**: High variance — providers differ significantly in output length

### Limitations

- Token estimates are heuristic (character-based), not actual token counts
- A short but semantically rich response may have lower token count than a verbose but shallow response

---

## Latency Variance

### Definition

Standard deviation of provider latency across runs.

### Formula

```typescript
function latencyVariance(runs: RunSnapshot[]): number {
  const latencies = runs.map(r => r.provider?.latency ?? 0)
  const mean = latencies.reduce((s, v) => s + v, 0) / latencies.length
  const variance = latencies.reduce((s, v) => s + (v - mean) ** 2, 0) / latencies.length
  return Math.sqrt(variance)
}
```

### Interpretation

- **< 500ms**: Low latency variance — providers respond at similar speeds
- **500–2000ms**: Moderate variance — some providers are faster than others
- **> 2000ms**: High variance — latency is dominated by specific provider or network conditions

### Limitations

- Latency includes network time, which varies with geography and network conditions
- First-request latency may include cold starts (DNS, connection pool)
- Latency is per-run, not averaged over multiple requests

---

## Divergence Score

### Definition

Composite score (0.0–1.0) measuring overall structural divergence.

### Components

| Component | Weight | Source |
|-----------|--------|--------|
| Prune deviation | 30% | Max difference in prune removed count |
| Summary deviation | 20% | Max difference in summary confidence |
| Token variance | 30% | CV of output tokens |
| Latency variance | 20% | Stddev of latency (normalized) |

### Interpretation Guidelines

| Divergence | What It Suggests |
|------------|------------------|
| 0.0–0.1 | Providers behaved near-identically at the structural level |
| 0.1–0.3 | Minor structural differences (expected for different providers) |
| 0.3–0.5 | Notable structural differences — likely affects user-visible output |
| > 0.5 | Major structural differences — providers are behaving very differently |

---

## Prune Diff

### Definition

Per-provider comparison of prune stage behavior:

```json
{
  "provider": "openai",
  "removedCount": 3,
  "shadowMode": true,
  "advisoryInfluenceUsed": false
}
```

### Interpretation

- **removedCount**: How many messages the prune stage considered removing
- **shadowMode**: Whether prune ran in shadow mode (no actual removal)
- **advisoryInfluenceUsed**: Whether the advisory system influenced prune decisions

### Cross-Provider Comparison

Prune decisions should ideally be identical across providers (the pipeline is deterministic). Differences suggest:

- Pipeline execution differed (bug)
- Context request differed between runs (should not happen)
- Random seed affected prune decisions (known limitation)

---

## Summary Diff

### Definition

Per-provider summary statistics:

```json
{
  "provider": "openai",
  "summaryCount": 1,
  "confidence": 0.75
}
```

### Interpretation

- **summaryCount**: Whether a summary was generated (0 or 1 for current implementation)
- **confidence**: Length-based heuristic confidence (0–1)

### Cross-Provider Comparison

Like prune, summary behavior should be identical across providers. Differences indicate pipeline divergence.

---

## Provider Ranking Score

### Definition

Composite efficiency score (0–100):

```
score = tokenEfficiency * 50 + latencyEfficiency * 30 + contentScore * 20
```

### Components Normalized

- **tokenEfficiency**: `1 - (outputTokens / maxTokens)`
- **latencyEfficiency**: `1 - (latency / maxLatency)`
- **contentScore**: `responseContentLength / maxContentLength`

### Interpretation

| Score | Meaning |
|-------|---------|
| 80–100 | Efficient — concise, fast, adequate content |
| 50–79 | Moderate — acceptable along some dimensions |
| 0–49 | Less efficient — verbose, slow, or brief |

**Not a quality score.** A rank-1 provider may produce low-quality output.
