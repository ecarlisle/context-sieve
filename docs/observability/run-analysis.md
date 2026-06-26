# Run Analysis

## Overview

Run analysis answers questions about execution quality, consistency, and change over time. All analysis is read-only — it operates on stored snapshots and never mutates them.

## Analysis Tools

### Diff — Compare Two Runs

Structural comparison of two snapshots:

```bash
context-sieve diff <runIdA> <runIdB>
```

Shows differences in:
- Token counts (input, output, delta)
- Prune decisions (what was removed, why)
- Summary content and confidence
- Provider resolution
- Stage statuses

### Benchmark — Score a Run

Quality scoring against a reference or the average:

```bash
context-sieve benchmark --compare <originalId> <optimizedId>
context-sieve benchmark --run <runId>
```

Produces:
- **Efficiency score:** Token reduction percentage
- **Integrity score:** Content preservation ratio
- **Stability score:** Divergence count from reference
- **Recommendation:** `keep` / `review` / `reject`

### Regression — Detect Degradation

Compare a group of baseline runs against candidate runs:

```bash
context-sieve regression --baseline <id1,id2> --candidate <id3,id4>
```

Returns:
- **Severity:** `none` / `low` / `medium` / `high`
- **Score:** 0–100 (higher = worse)
- **Signals:** Specific regressions per stage

### Search — Find Runs

Query run metadata:

```bash
context-sieve search --text "error" --run <runId>
context-sieve search --annotation issue
context-sieve search --has-summary --min-confidence 0.5
```

Filters:
- `--text`: Match in any metadata field
- `--run`: Specific run ID
- `--author`: Annotation author
- `--annotation`: Annotation type (`note`, `question`, `issue`, `insight`, `decision`)
- `--stage`: Stage name
- `--has-summary`: Runs with summary data
- `--has-diff`: Runs with diff snapshots
- `--has-causal`: Runs with causal analysis
- `--min-confidence`: Minimum summary confidence

## Analysis Data Flow

```
Snapshots (filesystem)
    │
    ├── diff ──────→ Structural comparison (fields, tokens, decisions)
    ├── benchmark ──→ Quality scoring (efficiency, integrity, stability)
    ├── regression ─→ Degradation detection (signal-based)
    └── search ─────→ Metadata query (indexed fields)
```

All tools read snapshots from the same store. No analysis tool writes to storage.

## Analysis Limitations

- **Cross-execution comparisons are heuristic.** Two runs with identical inputs may differ due to randomization or provider variance.
- **Benchmark scores are relative.** A score of 80 means "80% of reference quality" — it does not mean "80% correct."
- **Regression signals are structural.** Token count changes are easy to detect. Semantic regression requires human review.
