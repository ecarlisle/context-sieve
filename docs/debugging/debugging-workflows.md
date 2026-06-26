# Debugging Workflows

## Workflow 1: Debug a Run

Use when: A request returned unexpected content or an error.

### Step 1: Find the Run

```bash
# If you have the run ID
context-sieve inspect <run-id>

# If you don't have the ID, search by content
context-sieve search --text "partial response text"

# List recent runs
ls -lt data/snapshots/ | head
```

### Step 2: Check the Pipeline Trace

```bash
context-sieve inspect <run-id> --verbose
```

The verbose output shows the full pipeline trace with stage status and metadata.

Look for:
- Stage `status: 'error'` — the failure point.
- Stage `status: 'skipped'` — a stage that didn't run.
- Stage metadata — decision details.

### Step 3: Open the Interactive Debugger

```bash
context-sieve debug <run-id>
```

This opens an interactive terminal session. Commands:

```
n (next frame)        — advance one frame
p (previous frame)    — go back one frame
j (jump <index>)      — jump to a specific frame
s (summary)           — show aggregate metrics
q (quit)              — exit
```

Each frame shows:
- Stage name and status
- Decision reasoning
- Metadata as formatted JSON

### Step 4: Compare Against a Known Good Run

```bash
context-sieve diff <good-run-id> <bad-run-id>
```

The diff shows:
- Token count differences
- Stage presence differences
- Prune behavior differences
- Provider differences

### Debug Flow Diagram

```
1. Find run ──────► context-sieve search --text "..."
                            │
                            ▼
2. Inspect ───────► context-sieve inspect <id> --verbose
                            │
                    ┌───────┴───────┐
                    │               │
                    ▼               ▼
               Has error?      No error?
                    │               │
                    ▼               ▼
          3. Debug trace   3. Compare with golden
          context-sieve    context-sieve diff
          debug <id>       <golden> <id>
                    │               │
                    ▼               ▼
          4. Fix source    4. Identify delta
```

---

## Workflow 2: Inspect a Replay

Use when: You want to understand what happened during execution without re-running.

### Step 1: Load the Replay

```bash
context-sieve debug <run-id>
```

The debugger automatically loads the replay timeline. If replay artifacts don't exist, they are generated from the snapshot.

### Step 2: Walk Through Frames

Start at frame 0 (collect) and advance through each stage:

```
Frame 0/8: collect
  Status: ok
  Reasoning: Collected 12 messages from request

Frame 1/8: measure
  Status: ok
  Reasoning: Estimated 142 input tokens

Frame 2/8: budget
  Status: ok
  Reasoning: Budget allocated: 4096 tokens

Frame 3/8: summarize
  Status: skipped
  Reasoning: Summarization disabled by config

Frame 4/8: prune
  Status: ok
  Reasoning: Removed 3 low-signal messages
  Metadata: { removed: 3, advisoryUsed: true }

Frame 5/8: dedupe
  Status: ok
  Reasoning: Found and removed 1 duplicate

Frame 6/8: compress
  Status: ok
  Reasoning: Compressed 2 messages

Frame 7/8: retrieve
  Status: ok
  Reasoning: Retrieved 0 stored summaries

Frame 8/8: forward
  Status: ok
  Reasoning: Forwarded to openrouter (842ms)
  Metadata: { providerId: "openrouter", latency: 842 }
```

### Step 3: Check Annotations

If annotations exist for this run, they appear in the frame view:

```
Frame 4/8: prune
  Annotations:
    [alice] Why was message 3 pruned? (question)
    [bob] Low signal score after user repeated instruction (insight)
```

### Step 4: Compare Provider Selection

Check the forward frame for provider metadata:

```
Frame 8/8: forward
  Provider: openrouter
  Model: gpt-4o
  Latency: 842ms
```

If the provider is unexpected, check routing rules:
```bash
context-sieve providers resolve gpt-4o
```

---

## Workflow 3: Trace a Prune Decision

Use when: A message was removed and you want to understand why.

### Step 1: Find the Prune Frame

```bash
context-sieve inspect <run-id> --verbose
```

Look for the prune stage trace entry. It contains:

```json
{
  "stage": "prune",
  "status": "ok",
  "meta": {
    "removed": 3,
    "reasons": [
      {"index": 2, "reason": "low signal content after summary"},
      {"index": 5, "reason": "redundant echo of previous message"},
      {"index": 8, "reason": "advisory score below threshold (0.32)"}
    ],
    "advisoryInfluenceUsed": true,
    "highestAdvisoryScore": 0.87
  }
}
```

### Step 2: Map Removed Indices to Messages

Message indices correspond to the original request's `messages` array (0-indexed, excluding system messages if the prune stage treats them differently).

Check the snapshot:

```bash
context-sieve inspect <run-id> --verbose | grep -A5 "removed"
```

### Step 3: Understand the Prune Reason

| Reason | Meaning |
|--------|---------|
| `low signal content after summary` | Message content was summarized; original is redundant |
| `redundant echo of previous message` | Message repeats earlier content |
| `advisory score below threshold` | Advisory system rated this message as low importance |
| `exceeds budget allocation` | Message was removed to fit within token budget |

### Step 4: Verify With the Debugger

```bash
context-sieve debug <run-id>
```

Jump to the prune frame and inspect the reasoning in context.

---

## Workflow 4: Validate Provider Selection

Use when: You want to confirm the correct provider handled a request.

### Step 1: Check the Snapshot

```bash
context-sieve inspect <run-id> --verbose | grep -A5 "provider"
```

Expected:

```json
"provider": {
  "id": "openrouter",
  "model": "gpt-4o",
  "latency": 842
}
```

### Step 2: Simulate the Routing Decision

```bash
context-sieve providers resolve <model-name>
```

This shows which provider the router would select. Compare with the actual provider in the snapshot.

### Step 3: Check Routing Rules

```bash
context-sieve providers list
```

Shows all routing rules. Verify the rule that matches your model routes to the expected provider.

### Step 4: Test the Provider Directly

```bash
context-sieve providers test <provider-id>
```

Confirms the provider is reachable and authenticated.

### Resolution Flow

```
Provider is WRONG in request
        │
        ▼
Check snapshot provider metadata ──► context-sieve inspect <id>
        │
        ▼
Simulate routing ──► context-sieve providers resolve <model>
        │
        ├── matches snapshot? → routing is working correctly
        └── differs? → routing changed between execution and now
                        (check routing.yaml for recent edits)
        │
        ▼
Check routing rules ──► context-sieve providers list
        │
        ├── correct rule exists? → check rule ordering
        └── missing rule? → add to routing.yaml and restart
```

---

## CLI Quick Reference

```bash
# Find and inspect
context-sieve search --text "error"     # Search runs by content
context-sieve inspect <id>              # Snapshot summary
context-sieve inspect <id> --verbose    # Full trace details

# Debug
context-sieve debug <id>                # Interactive timeline

# Compare
context-sieve diff <id-a> <id-b>        # Structural comparison

# Provider
context-sieve providers list            # Show config + routing
context-sieve providers test openrouter # Test connectivity
context-sieve providers resolve gpt-4o  # Show routing target
```

---

## Debugging Principles

1. **Start with the snapshot.** It contains everything that happened. Don't guess.
2. **Walk the trace sequentially.** Each stage builds on the previous one. Starting at the error stage misses upstream context.
3. **Compare against a known good run.** Without a baseline, you don't know what "correct" looks like.
4. **Provider issues are not pipeline issues.** If the forward stage fails, test the provider directly before debugging the pipeline.
5. **Check routing before blaming the provider.** The wrong provider produces wrong results.
