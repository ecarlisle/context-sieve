# How To Use Context-Sieve

> **Note:** This guide has been superseded by [First Run](../docs/guides/first-run.md). This file is retained for reference.

## Quick start

```bash
npm install
npm run build
npm start
```

Server starts on port 3000 by default.

## Sending requests

Send standard OpenAI-compatible chat completion requests:

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "What is the capital of France?"},
      {"role": "assistant", "content": "The capital of France is Paris."},
      {"role": "user", "content": "What about Italy?"},
      {"role": "assistant", "content": "The capital of Italy is Rome."}
    ]
  }'
```

The response includes a `pipelineTrace` array showing each stage's execution metadata.

## Viewing metrics

```bash
curl http://localhost:3000/metrics
```

Returns summary statistics:

```json
{
  "requests": 42,
  "avgInputTokens": 127,
  "avgOutputTokens": 32,
  "avgLatencyMs": 234,
  "totalSummariesGenerated": 42,
  "avgSummaryConfidence": 0.85,
  "totalAdvisoryInfluenceHits": 38,
  "advisoryInfluenceHitRate": 0.9,
  "averageAdvisoryScore": 0.67
}
```

## Health check

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

## Interpreting pipeline traces

Each trace entry shows the stage name, status, and metadata:

```
[prune] → noop (removedCount: 2, shadowMode: true, candidates: 6,
          removable: 2, advisoryInfluenceUsed: true,
          highestAdvisoryScore: 1, advisoryScoreCount: 5)
```

- `shadowMode: true` — pruning is in shadow, no messages were actually removed
- `removable: 2` — 2 messages would have been removed if pruning were enabled
- `advisoryInfluenceUsed: true` — summary key points overlapped with messages
- `highestAdvisoryScore: 1` — perfect overlap between one message and a key point
- `advisoryScoreCount: 5` — 5 messages had non-zero advisory scores

## Configuration

Edit `src/config/index.ts` or set at startup:

| Setting | Default | Description |
|---------|---------|-------------|
| `enablePruning` | `false` | Master switch for pruning |
| `enableShadowPruning` | `true` | Run prune in shadow mode (record only) |
| `enableDeduplication` | `false` | Enable dedup stage |
| `enableCompression` | `false` | Enable compress stage |
| `pruningThreshold` | `5` | Min chars for low-signal rule |
| `port` | `3000` | HTTP server port |

## Streaming

Set `stream: true` in the request body:

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mock-model",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": true
  }'
```

The first event contains the pipeline trace, followed by individual content chunks.

## Testing advisory influence

Send a request with extractable facts to see advisory scores in the prune trace:

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mock-model",
    "messages": [
      {"role": "system", "content": "You are a history expert."},
      {"role": "user", "content": "The capital of France is Paris, which is a well-known fact."},
      {"role": "assistant", "content": "That is correct. Paris is the capital of France."}
    ]
  }'
```

Check the prune trace entry for `advisoryInfluenceUsed` and `advisoryScoreCount`. The assistant message will have a high advisory score because it overlaps with the user's factual statement.
