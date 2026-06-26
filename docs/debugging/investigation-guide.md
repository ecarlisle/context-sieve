# Investigation Guide

## When Something Goes Wrong

This guide walks through the investigation workflow for common scenarios.

## Workflow

```
1. Identify the failing run
2. Inspect the snapshot
3. Walk the timeline
4. Examine stage decisions
5. Compare with known-good runs
6. Determine root cause
7. Fix or annotate
```

---

## 1. Identify the Failing Run

If you have a run ID from a client response or log output:

```bash
context-sieve inspect <runId>
```

If you don't have a run ID, search for it:

```bash
# Find runs by text match
context-sieve search --text "error"
context-sieve search --text "timeout"

# Find runs with specific characteristics
context-sieve search --has-summary
```

List all snapshots:

```bash
ls data/snapshots/
```

---

## 2. Inspect the Snapshot

The `inspect` command shows top-level information:

```bash
context-sieve inspect <runId>

# Output:
# Request:  model=gpt-4o-mini, messages=3
# Response: tokens=142, latency=842ms
# Provider: openai (latency=800ms)
# Stages:   9 total, 1 error
```

For full detail:

```bash
context-sieve inspect <runId> --verbose
```

This prints every stage result with all metadata fields.

---

## 3. Walk the Timeline

The interactive debugger shows one stage at a time:

```bash
context-sieve debug <runId>
```

Navigate frames with arrow keys. Each frame shows:
- Stage name and status
- Decision confidence
- Metadata (tokens, IDs, scores)
- Reasoning text

This is the fastest way to understand what happened.

---

## 4. Examine Stage Decisions

Common failure patterns and where to look:

| Symptom | Look At |
|---|---|
| Wrong provider called | `forward` meta: `providerId`, `resolvedModel` |
| Too many tokens pruned | `prune` meta: `removedCount`, `advisoryScores` |
| Empty response | `forward` meta: `tokens`, `error` |
| Stage skipped unexpectedly | Stage `decision` field: `eligible`, `confidence` |
| Summary missing content | `summarize` meta: `keyPointsCount`, `confidence` |

---

## 5. Compare with Known-Good Runs

```bash
context-sieve diff <goodRunId> <badRunId>
```

The diff highlights:
- Token count differences
- Different stage statuses
- Different prune decisions
- Different provider resolution

For batch comparison:

```bash
# Find similar runs
context-sieve search --stage forward --text "error"
context-sieve search --model "gpt-4o-mini"
```

---

## 6. Determine Root Cause

Common root causes:

| Symptom | Likely Cause | Fix |
|---|---|---|
| Provider connection failed | API key missing or invalid | Check env vars, validate provider |
| High prune count | Threshold too aggressive | Adjust `pruningThreshold` in config |
| Noop forward stage | No provider resolved | Check routing rules, provider config |
| Low summary confidence | Too few messages | No fix needed — low confidence is informational |
| Stage error | Plugin crash or config issue | Check verbose output, disable plugin |

---

## 7. Fix or Annotate

If the run reveals an issue:

1. **Fix configuration** — update YAML files, restart
2. **Fix routing** — adjust routing patterns
3. **Annotate the snapshot** — document what went wrong
   ```bash
   context-sieve annotate <runId> <frameIndex> \
     --type issue --text "Provider returned 401 in forward stage"
   ```
4. **Re-run** — create a new snapshot with the fix applied
5. **Compare** — verify the fix resolved the issue

## Advanced: Failed Snapshot Investigation

When a snapshot exists but the forward stage failed:

```bash
# 1. Check the forward error
context-sieve inspect <runId> --verbose | grep -A5 "forward"

# 2. Test the provider directly
context-sieve providers test <providerId> --verbose

# 3. Check provider configuration
context-sieve providers list

# 4. Validate connectivity
context-sieve providers validate <providerId>
```

## Advanced: Replay Investigation

If replay shows unexpected behavior:

```bash
# 1. Verify snapshot integrity
context-sieve inspect <runId> --verbose

# 2. Check replay frame order
ls data/replay/<runId>/
cat data/replay/<runId>/frames.json | head -20

# 3. Regenerate replay artifacts
rm -rf data/replay/<runId>
context-sieve debug <runId>
```

If replay still looks wrong, the issue is in the snapshot. Inspect the raw snapshot file:

```bash
cat data/snapshots/<runId>.json | python3 -m json.tool | head -50
```

## Investigation Checklist

- [ ] Run ID identified
- [ ] Snapshot found and readable
- [ ] Timeline frames generated
- [ ] Forward stage status checked
- [ ] Provider connectivity validated
- [ ] Routing rules verified
- [ ] Configuration checked
- [ ] Known-good comparison available
- [ ] Root cause identified
- [ ] Fix applied or annotation created
