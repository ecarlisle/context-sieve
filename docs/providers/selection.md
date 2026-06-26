# Provider Selection

## Resolution Chain

When a request arrives, the system selects a provider in strict priority order:

```
1. Request override   (ctx.request.provider)
2. Routing rules      (micromatch pattern matching)
3. Default provider   (providers.yaml > default)
```

### 1. Override

If `ChatCompletionRequest.provider` is set, that exact provider is used. No routing rules are evaluated.

```typescript
registry.resolve('gpt-4o', 'anthropic') // → anthropic, regardless of model
```

### 2. Routing Rules

If no override is given, `ProviderRegistry.resolve()` iterates routing rules in config order:

```yaml
# config/routing.yaml
routing:
  "gpt-4*": "openai"
  "claude-*": "anthropic"
  "*": "openai"  # catch-all
```

The first matching rule wins. Patterns use [micromatch](https://github.com/micromatch/micromatch) glob matching.

### 3. Default Provider

If no rule matches, the default provider from `providers.yaml` is used. Falls back to `mock` if unconfigured.

## Resolution API

```bash
# See which provider handles a model
context-sieve providers resolve gpt-4o-mini
# → Model "gpt-4o-mini" -> provider "openai"
```

## What Selection Is NOT

- **Not load balancing.** No weights, no health checks, no round-robin.
- **Not failover.** If the selected provider fails, no automatic fallback.
- **Not model-based validation.** The routing pattern is string-matched against the model name. The system does not verify the provider actually supports the model.
