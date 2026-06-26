# Provider Debugging

## Verbose Mode

Start context-sieve with `--verbose` to see detailed provider logs:

```bash
context-sieve --verbose
```

Example output:

```
[config] loading providers from config/providers.yaml
[config] loaded providers: openai, anthropic, openrouter, ollama
[config] openai baseUrl=https://api.openai.com apiKey=[REDACTED]
[config] loading routing from config/routing.yaml
[config] loaded 6 routing rules

context-sieve running on http://localhost:3000

[request] POST /v1/chat/completions model=gpt-4o
[pipeline] stage=collect status=ok
[pipeline] stage=measure status=ok tokens=142
[pipeline] stage=budget status=ok
[pipeline] stage=summarize status=skipped (disabled)
[pipeline] stage=prune status=ok removed=3
[pipeline] stage=dedupe status=ok deduped=1
[pipeline] stage=compress status=ok
[pipeline] stage=retrieve status=ok
[pipeline] stage=forward status=ok
[provider] resolved=openrouter latency=842ms model=gpt-4o
```

## The [provider] Log Line

The most important line for debugging provider issues:

```
[provider] resolved=openrouter latency=842ms model=gpt-4o
```

| Field | Meaning |
|-------|---------|
| `resolved` | Which provider the router selected |
| `latency` | Round-trip time in milliseconds (includes network + provider inference) |
| `model` | The model name sent to the provider |

### What to Look For

**High latency (>5000ms):**

```
[provider] resolved=openrouter latency=12400ms model=gpt-4o
```

Possible causes:
- Provider is overloaded
- Network congestion
- The model is a very large one (e.g., o1-preview)
- Rate limiting (provider is delaying the response)

**Wrong provider:**

```
[provider] resolved=ollama latency=2ms model=gpt-4o
```

If you wanted OpenRouter but got Ollama, check:
1. Is there an explicit `provider` field in the request?
2. Does `routing.yaml` have a rule that matches before `gpt-*`?
3. Is OpenRouter configured?

**Missing provider line:**

If there's no `[provider]` line, the forward stage may have failed before reaching the provider. Check for error stage results:

```
[pipeline] stage=forward status=error
```

## Snapshot Provider Metadata

Every snapshot captures provider information. Inspect a run:

```bash
context-sieve inspect <run-id> --verbose
```

Look for the `provider` block:

```json
{
  "provider": {
    "id": "openrouter",
    "model": "gpt-4o",
    "latency": 842
  }
}
```

If `provider` is missing, the forward stage completed without provider metadata (MockProvider doesn't report provider metadata).

## Common Failures

### Failure 1: No Provider Resolved

**Error:**

```
[pipeline] stage=forward status=error meta={error: 'No provider resolved for model "gpt-4o"'}
```

**Causes:**

1. The model doesn't match any routing rule.
2. The matched routing rule points to a provider that doesn't exist.
3. No default provider is configured.

**Fix:**

1. `context-sieve providers resolve gpt-4o` to see what would resolve.
2. `context-sieve providers list` to check configured providers.
3. Add a matching routing rule or set a default.

### Failure 2: HTTP 401 Unauthorized

**Error:**

```
[pipeline] stage=forward status=error meta={error: 'HTTP 401: {"error":"Unauthorized"}'}
```

**Causes:**

1. API key is empty or not set.
2. API key is wrong.
3. Environment variable wasn't interpolated.

**Fix:**

1. `echo $PROVIDER_API_KEY` — is it set?
2. Check for `${}` in the verbose log. If you see `${OPENAI_API_KEY}` literally, the env var wasn't set.
3. `context-sieve providers test <id>` for a focused test.

### Failure 3: HTTP 429 Rate Limited

**Error:**

```
[pipeline] stage=forward status=error meta={error: 'HTTP 429: Too Many Requests'}
```

**Causes:**

1. Free-tier rate limit exceeded.
2. Burst of requests from the pipeline (unlikely — it's sequential).

**Fix:**

1. Wait and retry.
2. Add credits to your provider account.
3. Configure a fallback provider in routing.

### Failure 4: Connection Refused

**Error:**

```
[pipeline] stage=forward status=error meta={error: 'fetch failed: connect ECONNREFUSED localhost:11434'}
```

**Causes:**

1. Local provider (Ollama, LM Studio) is not running.
2. Wrong `baseUrl` in config.

**Fix:**

1. Start the local provider: `ollama serve`.
2. Verify the URL: `curl http://localhost:11434/api/tags`.

### Failure 5: Slow Responses

**Symptoms:**

- OpenCode feels sluggish.
- `[provider] latency` is consistently above 2000ms.

**Diagnosis with verbose:**

```
[provider] resolved=openrouter latency=3200ms model=claude-3.5-sonnet
[provider] resolved=openrouter latency=2800ms model=gpt-4o
[provider] resolved=openrouter latency=3400ms model=claude-3.5-sonnet
```

All providers show similar latency. The bottleneck is network or the upstream provider.

**Possible solutions:**

1. Switch to a faster provider (Ollama for development, OpenAI for production).
2. Reduce pipeline overhead by disabling expensive stages.
3. Check your internet connection.

### Failure 6: Inconsistent Responses

Provider A returns different results than Provider B for the same request. This is **expected** — different providers use different models with different training data, parameters, and behaviors.

**What to check:**

1. Is routing behaving consistently? Check `provider` in the snapshot metadata.
2. Are you using the same model name? OpenRouter may map `gpt-4o` to a different underlying model than direct OpenAI access.

## Debugging Checklist

When a provider fails:

1. **Check connectivity:**
   ```bash
   context-sieve providers test <id>
   ```

2. **Check routing:**
   ```bash
   context-sieve providers resolve <model>
   ```

3. **Check the snapshot:**
   ```bash
   context-sieve inspect <run-id> --verbose
   ```

4. **Check the trace:**
   ```bash
   context-sieve debug <run-id>
   ```
   The interactive debugger shows each pipeline stage and its metadata.

5. **Check the logs:**
   ```bash
   context-sieve --verbose 2>&1 | grep -E '\[provider\]|\[pipeline\]|error'
   ```

6. **Send a direct request (bypass the pipeline):**
   ```bash
   curl $BASE_URL/v1/chat/completions \
     -H "Authorization: Bearer $API_KEY" \
     -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"ping"}]}'
   ```
   If this also fails, the problem is upstream of context-sieve.
