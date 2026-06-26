# Testing Strategy

## Philosophy

context-sieve tests by **comparing stored artifacts**, not by asserting semantic meaning. The system is not an LLM evaluation platform — it does not judge response quality, factual accuracy, or helpfulness. Instead, it verifies that the pipeline produces consistent, predictable transformations.

### What We Test

- **Structural consistency:** Given the same input, does the pipeline produce the same stage sequence?
- **Decision traceability:** Are pruning decisions recorded with sufficient evidence?
- **Provider routing:** Does the correct provider handle the request?
- **Snapshot integrity:** Is the snapshot valid JSON with all required fields?
- **Replay determinism:** Does replay produce identical output from the same snapshot?

### What We Do NOT Test

- **Response quality:** We do not assert that "the response was helpful" or "the summary captured key information." Those are product decisions, not system guarantees.
- **Model behavior:** The provider's response is external. We test that we sent the right request and received a response, not what the response means.
- **Semantic similarity:** We do not use embeddings, cosine distance, or LLM-as-judge for test assertions.

---

## Golden Run Concept

A **golden run** is a reference execution whose snapshot is stored as the expected baseline. Subsequent runs (with the same input) are compared against the golden snapshot to detect unexpected changes.

```
Golden Run (known good)
        │
        ▼
Golden Snapshot (stored as baseline)
        │
        ▼
Test Run (new execution)
        │
        ▼
Compare: new snapshot vs golden snapshot
        │
        ├── Identical → test passes
        └── Different → test fails (investigate)
```

### What Makes a Good Golden Run

- **Simple input.** A short conversation that exercises the pipeline without hitting provider rate limits.
- **Deterministic stages.** Prefer stages that produce deterministic output (collect, measure, budget). Avoid stages with randomness (prune may vary).
- **Known expected output.** The response content should be predictable (MockProvider is ideal for golden runs).
- **All stages enabled.** The golden run should exercise the full pipeline to detect regressions.

---

## Snapshot-Based Assertions

Tests assert against snapshot structure, not response content.

### Assertion Examples

```typescript
// Assert that the snapshot has all required fields
assert.strictEqual(typeof snapshot.id, 'string')
assert.strictEqual(typeof snapshot.timestamp, 'number')
assert.ok(Array.isArray(snapshot.pipelineTrace))

// Assert that the pipeline ran all expected stages
const stageNames = snapshot.pipelineTrace.map(s => s.stage)
assert.deepStrictEqual(stageNames, [
  'collect', 'measure', 'budget', 'summarize',
  'prune', 'dedupe', 'compress', 'retrieve', 'forward'
])

// Assert that prune decisions were recorded
const pruneTrace = snapshot.pipelineTrace.find(s => s.stage === 'prune')
assert.ok(pruneTrace)
assert.ok(pruneTrace.meta)
assert.ok('removed' in (pruneTrace.meta as Record<string, unknown>))
```

### What We Assert

| Assertion | Example |
|-----------|---------|
| Snapshot has valid ID | `snapshot.id` matches pattern `snap-*` |
| Pipeline trace is complete | All 9 stages present in order |
| Decision metadata exists | Prune stage has `removed` count |
| Provider metadata exists | Forward stage has `providerId` |
| Response is non-empty | `snapshot.response.content.length > 0` |
| Token estimates are positive | `snapshot.metrics.inputTokens > 0` |

---

## Why No Semantic Testing

Semantic testing (e.g., "does the summary capture the main points?") requires a human or LLM judge. This introduces:

- **Subjectivity:** Two judges may disagree on quality.
- **Non-determinism:** An LLM judge returns different results on different runs.
- **Cost:** Every test run incurs LLM inference cost.
- **Complexity:** You need a separate evaluation framework.

context-sieve avoids all of this by testing only what it can guarantee: structure, presence, ordering, and format.

**If you need semantic testing**, compare pipeline outputs using external evaluation frameworks (e.g., LangSmith, Arize, custom judges). context-sieve provides the snapshots as input data; it does not evaluate them.

---

## Regression Detection Philosophy

Regression detection in context-sieve is **structural**, not semantic. It compares:

- **Token counts:** Did input/output tokens change significantly?
- **Stage presence:** Did a stage stop running or start skipping?
- **Prune behavior:** Did the prune ratio change?
- **Summary confidence:** Did summary confidence drop?
- **Provider selection:** Did the request route to a different provider?

### What Regression Detects

| Signal | What It Means |
|--------|---------------|
| Input token delta > 10% | Pipeline is sending more/less context |
| Output token delta > 10% | Provider is generating more/less |
| Prune ratio change | Pruning behavior shifted |
| Summary confidence drop | Summarization quality may have degraded |
| Different provider | Routing configuration changed |

### What Regression Does NOT Detect

- Response quality changes
- Semantic drift
- Factual accuracy changes
- Hallucination rates

---

## Testing Hierarchy

```
Unit Tests (stage level)
  └─ Test individual pipeline stages in isolation
     └─ Assert stage results match expectations

Integration Tests (pipeline level)
  └─ Test full pipeline with MockProvider
     └─ Assert snapshot structure and trace completeness

Golden Run Tests (regression)
  └─ Compare new snapshots against stored golden snapshots
     └─ Assert structural equivalence

Provider Tests (connectivity)
  └─ Test provider adapters with mock HTTP servers
     └─ Assert request normalization and response parsing
```

---

## CLI Testing

```bash
# Run golden test suite
context-sieve test golden

# Compare two snapshots
context-sieve diff <golden-run-id> <test-run-id>

# Validate provider configuration
context-sieve providers list
context-sieve providers test openrouter

# Inspect a specific snapshot for manual verification
context-sieve inspect <run-id> --verbose
```

---

## Common Failure Modes

**"My test passes but the output is wrong."**
You are testing structure, not semantics. Add a golden snapshot comparison to detect unexpected changes.

**"The golden run and test run are identical but the provider returned different content."**
This is expected. The provider response is external and not under test. If you need to assert provider behavior, write a separate integration test for the adapter.

**"Regression detection says everything is fine but the summary quality degraded."**
Regression detection is structural. It does not measure summary quality. Use an external evaluation tool for that.

**"My test fails because the snapshot has a different timestamp."**
Timestamps are expected to differ between runs. Filter out timestamp fields when comparing snapshots, or use the golden run framework which compares structural fields only.
