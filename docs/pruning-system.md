# Pruning System

> **Note:** This content is now covered in [Pipeline Invariants](../docs/core/pipeline-invariants.md). This file is retained for reference.

## Overview

The pruning system reduces context length by removing low-value messages before forwarding to the upstream provider. It operates in two modes:

1. **Shadow mode** (default) — records pruning decisions without modifying the request
2. **Applied mode** — actually removes identified messages

## Three detection rules

Rules run in order. Each rule identifies a set of messages for removal:

### Rule A: Exact duplicates

Scans all non-system messages. If two messages share the same `role` and `content`, the later one is removed.

```typescript
key = `${role}::${content}`
```

System messages are always preserved.

### Rule B: Low-signal messages

Removes messages that are both:
- Below the configurable `pruningThreshold` (character count), AND
- Contain no task-relevant keywords (extracted from system prompt or first user message)

Prevents removal of short but meaningful messages (e.g. "yes", "no", "42").

### Rule C: Redundant echoes

Detects assistant messages that parrot the preceding user message (>80% word overlap). This catches patterns where the assistant restates the user's question before answering.

Only applies to assistant messages immediately following a user message.

## Advisory influence (v0.6+)

Starting in v0.6, the prune stage receives **advisory hints** from the shadow summary stage. The summary's key points are compared against each message using word-overlap scoring:

### scorePruneCandidatesWithSummaryHints

```
for each message:
  for each key point in shadow summary:
    compute word overlap ratio (words > 3 chars)
    if ratio > 0: record highest overlap as advisoryScore

if any message has an advisoryScore > 0:
  set advisoryInfluenceUsed = true
  highestAdvisoryScore = max of all scores
```

### Advisory contract

- Advisory scores MAY only increase pruning confidence
- Advisory scores MUST NOT trigger removal by themselves
- If rule-based logic says "keep", the item must be kept
- Rule-based pruning (Rules A/B/C) is always PRIMARY
- Advisory influence is recorded in trace metadata but never in removal decisions

### When advisory is available

Advisory hints exist when the shadow summary stage generated key points (i.e., the request contained extractable facts, decisions, or constraints). If no key points were extracted, advisory influence is skipped.

## PruneResult structure

```typescript
interface PruneResult {
  original: unknown            // Full original request
  pruned: unknown              // Request with pruned messages
  removed: RemovedItem[]       // Items marked for removal
  advisoryScores?: AdvisoryScore[]   // Per-message advisory scores (v0.6+)
  advisoryInfluenceUsed?: boolean    // Whether advisory influenced the run (v0.6+)
  highestAdvisoryScore?: number      // Maximum advisory score (v0.6+)
}
```

## Configuration

```typescript
interface Config {
  enablePruning: boolean       // Master toggle
  enableShadowPruning: boolean // Shadow mode (default: true)
  pruningThreshold: number     // Min chars for Rule B (default: 5)
}
```

## Shadow vs Applied mode

### Shadow mode (`enableShadowPruning: true`)

- All three rules run normally
- Detection results are logged and traced
- The original request is forwarded unchanged
- Useful for evaluating pruning quality before enabling

### Applied mode (`enablePruning: true && enableShadowPruning: false`)

- Same detection rules
- Identified messages are removed from the request before forwarding

## Pipeline trace fields

The prune stage emits these fields in `StageResult.meta`:

| Field | Type | Description |
|-------|------|-------------|
| removedCount | number | Total items removed by all rules |
| shadowMode | boolean | Whether pruning was shadow/applied |
| candidates | number | Total messages considered (shadow only) |
| removable | number | Messages marked for removal (shadow only) |
| advisoryInfluenceUsed | boolean/undefined | Whether advisory scores were computed (v0.6+) |
| highestAdvisoryScore | number/undefined | Best overlap score found (v0.6+) |
| advisoryScoreCount | number/undefined | Messages with non-zero scores (v0.6+) |
