# Comparison Model

## Overview

The comparison engine performs **structural and metric-based comparison** of multiple snapshots. It does **not** perform semantic analysis, use embeddings, or make judgments about output quality.

## Comparison Dimensions

| Dimension | What It Measures | How |
|-----------|-----------------|-----|
| Token variance | How widely output token counts differ across providers | Coefficient of variation (stddev / mean) |
| Latency variance | How widely response times differ | Standard deviation of latencies |
| Prune diff | Did providers exhibit different pruning behavior? | Per-provider prune metrics |
| Summary diff | Did the summary stage behave differently? | Per-provider summary metrics |
| Output diff | What is the range of output characteristics? | Min/max/avg of tokens, latency, content length |
| Provider ranking | Which provider was most efficient? | Composite score (token efficiency + latency + content) |

## Divergence Score

The divergence score is a single number (0.0–1.0) representing how structurally different the runs are:

```
divergenceScore = 1 - (
    pruneScore * 0.3 +
    summaryScore * 0.2 +
    tokenScore * 0.3 +
    latencyScore * 0.2
)
```

Where:

- **pruneScore**: Based on max prune difference across providers (normalized to 0–1)
- **summaryScore**: Based on max summary confidence difference (normalized to 0–1)
- **tokenScore**: Based on token variance (coefficient of variation, inverted)
- **latencyScore**: Based on latency variance (normalized to 0–1)

### Interpretation

| Score | Meaning |
|-------|---------|
| 0.0–0.1 | Low divergence — providers produced structurally similar results |
| 0.1–0.3 | Moderate divergence — some structural differences |
| 0.3–0.5 | High divergence — significant structural differences |
| 0.5–1.0 | Very high divergence — providers behaved very differently |

## What Divergence Does NOT Mean

- **High divergence ≠ bad results.** Different providers produce different outputs. This is expected.
- **Low divergence ≠ good results.** Providers may agree on an incorrect output.
- **Divergence does not measure semantic quality.** It measures structural differences only.

---

## Output Diff

The output diff provides summary statistics:

```json
{
  "tokenRange": { "min": 42, "max": 156, "avg": 89 },
  "latencyRange": { "min": 320, "max": 1450, "avg": 720 },
  "contentLengthRange": { "min": 168, "max": 624, "avg": 356 }
}
```

These show the spread of values, not which provider produced which value.

---

## Provider Ranking

Providers are ranked by a composite score (0–100):

```
score = tokenEfficiency * 0.5 + latencyEfficiency * 0.3 + contentScore * 0.2
```

Where:

- **tokenEfficiency**: Lower output tokens = higher score (normalized against max)
- **latencyEfficiency**: Lower latency = higher score (normalized against max)
- **contentScore**: Longer content = higher score (normalized against max)

### Interpretation

| Rank | Meaning |
|------|---------|
| 1 | Most token-efficient + fastest + most content-dense |
| N | Least efficient overall |

**This is a structural heuristic, not a quality judgment.** The ranking does not consider output correctness, relevance, or user satisfaction.

---

## Limitations

- **No semantic comparison.** The engine cannot determine which output is "better."
- **No cross-provider content matching.** Despite using the same input, outputs may differ structurally making direct comparison difficult.
- **Token estimates are heuristic.** Token variance may reflect estimation error, not actual model behavior.
- **Latency includes network time.** Rankings may be affected by network conditions rather than provider performance.
