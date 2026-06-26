# Run Golden Tests

## Overview

Golden tests verify pipeline behavior against pre-recorded fixtures. They replay stored snapshots through the pipeline and compare the output against expected results.

## Running

```bash
# Run all golden tests
pnpm test:golden

# Run with verbose output
npx tsx src/index.ts test golden --verbose
```

## What Golden Tests Verify

| Aspect | What's Checked |
|---|---|
| Stage order | All stages execute in the expected sequence |
| Decision consistency | Analyzer decisions match the recorded trace |
| Snapshot structure | Output snapshot has all required fields |
| Token estimation | Input/output token counts are within expected range |
| Provider resolution | Provider is resolved correctly for the model |

## Test Fixtures

Golden fixtures are JSON files in `tests/golden/`:

```
tests/golden/
├── trivial.json     # 1 message, minimal request
├── medium.json      # 6 messages, moderate complexity
└── heavy.json       # 10 messages, full pipeline
```

Each fixture is a complete `RunSnapshot` with expected values.

## Adding a New Fixture

### 1. Create a Request

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"test-model","messages":[{"role":"user","content":"Your test prompt"}]}'
```

Save the `runId` from the response.

### 2. Capture the Snapshot

```bash
cp data/snapshots/<runId>.json tests/golden/my-test.json
```

### 3. Register in the Test Suite

Add a test case in `tests/golden/replay.test.ts`:

```typescript
it('replays fixture: my-test.json', async () => {
  const fixture = loadFixture('my-test.json')
  const result = await pipeline.run(fixtureToContext(fixture))
  expect(result.ctx.response).toBeDefined()
  expect(result.trace.length).toBe(9)
})
```

### 4. Verify

```bash
pnpm test:golden
```

## Fixture Maintenance

When pipeline behavior changes, golden fixtures may need regeneration:

```bash
# Regenerate all fixtures
rm tests/golden/*.json
# Re-capture from live requests

# Or update specific fixtures
rm tests/golden/trivial.json
# Run a new request and copy the snapshot
```

## What Golden Tests Do NOT Verify

- Provider response quality
- External connectivity
- Cross-request consistency
- Performance under load
