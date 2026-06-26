# Provider FAQ

## General

### Why use a proxy at all?

A proxy gives you a single point of control over all LLM requests in your organization. Instead of configuring API keys, base URLs, and model names in every tool (OpenCode, scripts, CI, custom apps), you point everything at the proxy and let it handle routing, transformation, and observability.

With context-sieve specifically, the proxy also **reduces token usage** by removing redundant context before sending requests to the provider. This means lower costs and faster responses.

### Why not call providers directly?

Calling providers directly works for simple cases. But as you scale, you run into:

- **Vendor lock-in** — Every tool is hardcoded to one provider.
- **Manual routing** — You need to update configs to switch models or providers.
- **Wasted tokens** — No deduplication or pruning of redundant context.
- **No observability** — No record of what was sent, what was returned, or how much it cost.
- **No fallbacks** — If a provider is down, your tooling is down.

context-sieve solves all of these with a single service.

### Can one model route to many providers?

Yes, but not at the same time. Each request is routed to exactly one provider. You can configure different providers for different model name patterns:

```yaml
routing:
  "gpt-4o-mini": openrouter    # cheap queries
  "gpt-4o": openai             # important queries
```

But a single `gpt-4o-mini` request always goes to OpenRouter (or whatever the first matching rule says).

### Can providers modify execution?

No. Providers are transport-only. They receive the pipeline's optimized request and return a response. They cannot:

- Modify pipeline behavior
- Skip pipeline stages
- Access or alter snapshots
- Change routing rules
- Access other providers' data

The separation between execution and inference is strict.

## Configuration

### Can I use multiple API keys for the same provider?

Not currently. Each provider entry in `providers.yaml` corresponds to one API key. If you need multiple keys (e.g., for load balancing), configure multiple provider entries with different IDs:

```yaml
providers:
  openai-primary:
    apiKey: ${OPENAI_KEY_1}
  openai-secondary:
    apiKey: ${OPENAI_KEY_2}

routing:
  "gpt-*": openai-primary
  "*": openai-secondary
```

### What happens if a provider is not configured?

Unconfigured providers are simply not available. If a routing rule points to a missing provider, the router skips that rule and tries the next one. If no rule matches and no default is configured, the request fails with `No provider resolved`.

### Do I need to restart to pick up config changes?

Yes. Provider config and routing rules are loaded at startup. To apply changes:

1. Edit the YAML file.
2. Restart context-sieve (Ctrl+C, `pnpm dev`).

Hot-reload is not yet supported.

### Can I disable the pipeline and just use the proxy for routing?

Yes. Set all compression stages to disabled in `src/config/index.ts`:

```typescript
enablePruning: false,
enableDeduplication: false,
enableCompression: false,
```

The pipeline will still run (collect and measure), but no transformation will be applied.

## Performance

### How much latency does context-sieve add?

Pipeline processing adds 5–50ms per request. The forward stage adds network latency to the provider (typically 200–2000ms). Total latency = pipeline overhead + network round-trip + provider inference.

For local providers (Ollama, LM Studio), total latency is typically 50–500ms including pipeline overhead.

### Does the pipeline run for every request?

Yes. The pipeline always runs, even if all stages are disabled. This ensures consistent metrics and traceability. If you need absolute minimum latency, consider running without the proxy for non-critical requests.

### How do retries work?

context-sieve does not retry failed requests. If a provider returns an error, the forward stage fails and the error is returned to the client. Retry logic belongs in:

- The client (OpenCode, curl, etc.)
- A future middleware or circuit-breaker layer

## Snapshots and Observability

### Why are snapshots immutable?

Snapshots are immutable records of what actually happened. Once a request completes, its snapshot is written to disk and never modified. This guarantees:

- **Auditability** — You can always see exactly what was sent and received.
- **Debugging** — Reproduce any past request's exact pipeline behavior.
- **Comparisons** — Benchmark runs against historical data without worrying about data changing.
- **Replay** — Re-watch the pipeline execution as it happened.

If you need to annotate a snapshot, use the annotation system. Annotations are stored separately and overlaid on top of the immutable snapshot.

### How long are snapshots retained?

Indefinitely, by default. Snapshots are stored as JSON files in `data/snapshots/`. You can delete old snapshots manually or write a cleanup script.

### Can I export snapshots?

Yes. The replay system exports snapshots to the filesystem. Use the CLI:

```bash
context-sieve diff <run-id-1> <run-id-2>
```

Or use the API:

```bash
curl http://localhost:3000/api/run/<run-id>
```

## Providers

### What's the difference between a provider and an adapter?

A **provider** is a service (OpenAI, OpenRouter, Ollama). An **adapter** is the code that translates context-sieve's standard request format into the provider's native format.

### Can I use context-sieve without any cloud provider?

Yes. Use the MockProvider (default) or Ollama/LM Studio for local inference. MockProvider returns a fixed response instantly. Ollama and LM Studio run models on your machine.

### Why does Anthropic need special handling?

Anthropic's API is structurally different from OpenAI's:
- Different endpoint: `/v1/messages` vs `/v1/chat/completions`
- `max_tokens` is required, not optional
- Different response format: `content[0].text` vs `choices[0].message.content`
- System messages go to a separate `system` parameter

The adapter handles all of these differences so the rest of the system sees a uniform interface.

### Can I add my own private model?

Yes. If your model is served behind an API:
- If it's OpenAI-compatible, use the OpenAI adapter with a custom `baseUrl`.
- If it uses a custom protocol, write a [custom adapter](./build-your-own-provider.md).

## Troubleshooting

### I get "No provider resolved" for every request.

Your default provider is not configured. Either:
1. Set `default` in `providers.yaml` to a configured provider.
2. Configure routing rules in `routing.yaml`.
3. Run `context-sieve providers list` to see what's available.

### All responses are the same.

MockProvider is active. Configure at least one real provider and set it as the default.

### I see `${VARIABLE}` in logs instead of values.

The environment variable is not set. Run `echo $VARIABLE` to verify. Add it to your shell profile or `.env` file.

### The proxy starts but I can't reach it.

Check:
1. Is it running? `ps aux | grep context-sieve`
2. Is the port correct? Default is 3000.
3. Is something else on port 3000? `lsof -i :3000`

### OpenCode says "invalid API key" but the proxy works with curl.

OpenCode requires `OPENAI_API_KEY` to be set, even if the proxy ignores it. Set it to any value:

```bash
export OPENAI_API_KEY=anything
```
