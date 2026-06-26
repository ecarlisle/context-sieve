# First Run

## Goal

Send your first request through context-sieve, inspect the result, and verify the pipeline ran.

## Prerequisites

- Node.js 18+
- pnpm installed

## Steps

### 1. Install and Start

```bash
pnpm install
pnpm dev
```

You should see:

```
context-sieve running on http://localhost:3000
```

### 2. Verify the Server Is Running

```bash
curl http://localhost:3000/health
# → {"status":"ok"}
```

### 3. List Configured Providers

```bash
npx tsx src/index.ts providers list
```

With default configuration, the mock provider should appear.

### 4. Send a Request

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Hello"}]}'
```

The response includes:
- `content`: The provider's reply
- `pipelineTrace`: Array of stage results
- `runId`: Snapshot ID for later inspection

### 5. Inspect the Snapshot

```bash
npx tsx src/index.ts inspect <runId>
```

This shows the request, response, token counts, and provider info.

### 6. Explore the Timeline

```bash
npx tsx src/index.ts debug <runId>
```

Step through each pipeline stage to see what decisions were made.

## What You Should See

- Pipeline stages: collect → measure → budget → summarize → prune → dedupe → compress → retrieve → forward
- Forward stage: resolved to mock provider, returned a response
- Snapshot saved to `data/snapshots/`

## Next Steps

- [Provider Setup](../guides/provider-setup.md) — configure real providers
- [Run Golden Tests](../guides/run-golden-tests.md) — verify pipeline behavior
- [Provider Overview](../providers/overview.md) — understand provider architecture
