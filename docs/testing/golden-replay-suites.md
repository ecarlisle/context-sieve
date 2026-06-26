# Golden Replay Suites

## What Is a Golden Run

A **golden run** is a recorded pipeline execution that serves as the reference baseline for regression detection. It is the single source of truth for "what correct behavior looks like."

Golden runs are stored as standard `RunSnapshot` files in `data/snapshots/`. They differ from regular snapshots only in intent: a golden snapshot is intentionally preserved as a benchmark, not just as a record.

---

## How Golden Runs Are Recorded

### Step 1: Prepare the Test Input

Create a request file with known, stable input:

```bash
cat > test-input.json << 'EOF'
{
  "model": "gpt-4o-mini",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "What is the capital of France?"}
  ]
}
EOF
```

### Step 2: Execute Through the Pipeline

Send the request through context-sieve with MockProvider (to ensure deterministic responses):

```bash
curl -o golden-response.json http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d @test-input.json
```

### Step 3: Capture the Run ID

```bash
RUN_ID=$(cat golden-response.json | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);console.log(j.runId)})")
echo $RUN_ID
```

### Step 4: Preserve as Golden

Copy the snapshot to a known golden location:

```bash
cp data/snapshots/$RUN_ID.json data/golden/example-run.json
```

Or keep it in the snapshot store and reference it by ID.

---

## Validating Against Golden Runs

### Manual Diff

```bash
context-sieve diff <golden-run-id> <test-run-id>
```

Expected output:

```
Comparing runs: golden-run vs test-run
  Input tokens:   142 vs 142 (0% delta)
  Output tokens:  24 vs 24 (0% delta)
  Stage order:    identical
  Prune behavior: identical (3 removed)
  Summary:        identical (confidence 0.87)
```

If differences appear, investigate the stage that changed.

### Structural Comparison

For programmatic validation, compare the structural fields:

```typescript
function isStructurallyEquivalent(
  golden: RunSnapshot,
  candidate: RunSnapshot
): boolean {
  // Compare pipeline trace structure (not content)
  if (golden.pipelineTrace.length !== candidate.pipelineTrace.length) {
    return false
  }

  for (let i = 0; i < golden.pipelineTrace.length; i++) {
    const g = golden.pipelineTrace[i]
    const c = candidate.pipelineTrace[i]

    // Stage name and status must match
    if (g.stage !== c.stage) return false
    if (g.status !== c.status) return false
  }

  return true
}
```

---

## Golden Test Suite

A golden test suite is a collection of golden runs covering different scenarios:

```
data/golden/
├── simple-qa.json              # Single user message
├── multi-turn.json              # Conversation with 5+ messages
├── with-system-prompt.json      # System message included
├── long-context.json            # 10K+ token context
├── with-streaming.json          # Streamed response
├── with-pruning.json            # Exercise prune stage
├── all-providers/               # One golden run per provider
│   ├── openrouter.json
│   ├── ollama.json
│   └── openai.json
```

### Running the Suite

```bash
context-sieve test golden
```

Expected output:

```
Golden test suite:
  ✓ simple-qa           (structural match)
  ✓ multi-turn          (structural match)
  ✓ with-system-prompt  (structural match)
  ✓ long-context        (structural match)
  ✓ with-streaming      (structural match)
  ✓ with-pruning        (structural match)
  ─ all-providers/openrouter  (skipped — provider not configured)

6 passed, 0 failed, 1 skipped
```

### Adding a New Golden Run

1. Create the input JSON.
2. Send the request and capture the snapshot.
3. Copy the snapshot to `data/golden/`.
4. Run `context-sieve test golden` to validate.

---

## Golden Run Selection Criteria

A good golden run has:

| Criterion | Why |
|-----------|-----|
| **Stable input** | Same input every time produces comparable output |
| **Deterministic response** | MockProvider avoids provider variance |
| **Exercises specific stages** | Each golden run has a purpose (test pruning, test dedup, etc.) |
| **Small context** | Fast to execute and easy to inspect manually |
| **Known trace length** | Expected stage count is known and verifiable |
| **Minimal randomness** | Avoid stages with random seeds if possible |

---

## What Golden Runs Do NOT Test

- **Provider behavior.** Golden runs use MockProvider by default. Provider-specific tests are separate.
- **Response quality.** The golden snapshot records what happened, not whether it was "good."
- **Performance.** Golden runs do not assert latency bounds.
- **Cross-version compatibility.** A golden run from v1.0 may not be replayable in v2.0 if the snapshot format changed.

---

## Common Failure Modes

**"Golden run and test run have different timestamps."**
Timestamps always differ between executions. Compare structural fields only, or use the golden run framework which excludes timestamps automatically.

**"Golden run is invalid because the snapshot format changed."**
Regenerate golden runs after a snapshot format update. Old golden runs are still valid JSON but may be missing fields the new system expects.

**"Golden test passes but the production system behaves differently."**
Golden tests use MockProvider by default. Provider-specific behavior is not covered. Add provider-specific integration tests.

**"I can't reproduce the golden run because the provider API changed."**
Golden runs preserve the provider response as it was. The replay shows the original response. You cannot re-execute the golden run with a different provider — the response would differ.
