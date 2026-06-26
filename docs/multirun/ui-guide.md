# Multi-Run UI Guide

## Accessing the Multi-Run Viewer

### Via Tab

1. Open the context-sieve UI at `http://localhost:3000/ui`
2. Click the **Multi-Run** tab
3. Enter a model name and message
4. Click "Run Across All Providers"

### Via URL

Navigate directly to `/ui/multirun/<groupId>` to view a specific comparison group.

---

## UI Features

### Run Panel

Displays each provider's snapshot ID and execution status.

### Divergence Score Card

Shows the overall divergence score (0–100%) with color coding:
- **Green** (< 30%): Low divergence
- **Orange** (30–70%): Moderate divergence  
- **Red** (> 70%): High divergence

### Token & Latency Variance

Percentage and millisecond variance values.

### Output Range Table

Shows min/max/avg across all runs for:
- Token count
- Latency (ms)
- Content length (characters)

### Prune Decisions Table

Per-provider prune metrics:
- Messages removed
- Shadow mode status

### Provider Ranking Table

Providers ranked by composite score (descending):
- Rank position
- Provider name
- Score (0–100)

### Past Multi-Runs List

History of previous multi-run groups, showing:
- Group ID
- Number of runs
- Provider names

---

## Interpreting the Multi-Run View

### Low Divergence (< 30%)

All providers produced structurally similar outputs. The input is likely "stable" — different models agree on length and structure.

### High Divergence (> 30%)

Providers differ structurally. This is expected for:
- Complex prompts that elicit varied responses
- Models with different tokenization
- Models with different training data

### Using Provider Ranking

The ranking shows structural efficiency only. A highly ranked provider is not necessarily "correct" — it just used fewer tokens and responded faster.

---

## When to Use

- **Comparing provider behavior** for a specific prompt
- **Validating output consistency** across providers
- **Debugging provider-specific issues** (one provider shows anomalous token counts)
- **Selecting a provider** for a specific use case based on structural characteristics
