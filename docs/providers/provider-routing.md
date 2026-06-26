# Provider Routing

## How Requests Are Routed

Every request goes through a three-step resolution chain. The first match wins.

```
                 ┌─────────────────────┐
                 │  Request arrives     │
                 │  model="gpt-4o"      │
                 └──────────┬──────────┘
                            │
                            ▼
             ┌─────────────────────────────┐
             │ Step 1: Explicit Override   │
             │                             │
             │ Does the request JSON       │
             │ include "provider" field?   │
             │                             │
             │   { "provider": "openrouter" }  │
             └──────────┬──────────────────┘
                        │
                    ┌───┴───┐
                    │  yes  │  Use that provider directly
                    └───┬───┘
                        │ no
                        ▼
             ┌─────────────────────────────┐
             │ Step 2: Routing Rules       │
             │                             │
             │ routing.yaml:               │
             │   "gpt-*": openrouter       │
             │   "claude-*": anthropic     │
             │                             │
             │ Match model name against    │
             │ each rule (glob pattern).   │
             └──────────┬──────────────────┘
                        │
                    ┌───┴───┐
                    │ match │  Use the matched provider
                    └───┬───┘
                        │ no match
                        ▼
             ┌─────────────────────────────┐
             │ Step 3: Default Provider    │
             │                             │
             │ providers.yaml:             │
             │   default: openrouter       │
             │                             │
             │ If no override and no       │
             │ routing rule matched.       │
             └──────────┬──────────────────┘
                        │
                        ▼
             ┌─────────────────────────────┐
             │  Provider resolves to       │
             │  an InferenceProvider       │
             │  adapter instance           │
             └─────────────────────────────┘
```

## Step 1: Explicit Override

Pass a `provider` field in the request body. This bypasses all routing rules and the default.

**Good:**

```json
{
  "model": "gpt-4o",
  "messages": [{"role": "user", "content": "Hello"}],
  "provider": "openrouter"
}
```

This request will always go to OpenRouter, regardless of what `routing.yaml` says.

**Bad — typo in provider name:**

```json
{
  "provider": "openrouterr"
}
```

The router returns `null` and the forward stage fails with `No provider resolved for model "gpt-4o"`.

**Bad — provider not configured:**

```json
{
  "provider": "anthropic"
}
```

If Anthropic is not in `providers.yaml`, the router returns `null`.

## Step 2: Routing Rules

Rules are defined in `config/routing.yaml`. Each rule is a glob pattern that matches against the model name.

### Good Config

```yaml
routing:
  "gpt-*": openrouter
  "claude-*": anthropic
  "o1-*": openai
  "llama-*": ollama
  "*": openrouter
```

**How matching works:**

| Model | Rule Matched | Provider |
|-------|-------------|----------|
| `gpt-4o` | `gpt-*` | openrouter |
| `gpt-4o-mini` | `gpt-*` | openrouter |
| `claude-3.5-sonnet` | `claude-*` | anthropic |
| `o1-preview` | `o1-*` | openai |
| `llama-3.1-8b` | `llama-*` | ollama |
| `gemini-pro` | `*` | openrouter (catch-all) |

### Bad Configs

**Overlapping patterns — first wins:**

```yaml
routing:
  "gpt-*": openrouter
  "gpt-4o": anthropic   # never matches, gpt-* comes first
```

The second rule is unreachable. Rules are evaluated in order.

**Empty pattern:**

```yaml
routing:
  "": openrouter
```

An empty pattern never matches anything valid.

**Missing provider:**

```yaml
routing:
  "gpt-*": nonexistent-provider
```

If `nonexistent-provider` is not in `providers.yaml`, the router skips this rule and continues to the next one or falls back to the default.

## Step 3: Default Provider

The default is set in `providers.yaml`:

```yaml
default: openai

providers:
  openai:
    apiKey: ${OPENAI_API_KEY}
```

Every request that doesn't have an explicit override AND doesn't match a routing rule goes to the default.

If no default is set, it falls back to `mock`.

## Testing Routing Resolution

Use the CLI to test which provider a model resolves to:

```bash
context-sieve providers resolve gpt-4o
# Model "gpt-4o" -> provider "openrouter"

context-sieve providers resolve claude-3.5-sonnet
# Model "claude-3.5-sonnet" -> provider "anthropic"

context-sieve providers resolve llama-3.1-8b
# Model "llama-3.1-8b" -> provider "ollama"
```

## Route Metadata in Snapshots

Every run snapshot captures which provider handled the request:

```json
{
  "provider": {
    "id": "openrouter",
    "model": "gpt-4o",
    "latency": 842
  }
}
```

This is visible in the timeline debugger and the search results.

## Troubleshooting

**Request goes to the wrong provider:**

1. Check for an explicit `provider` field in the request body.
2. Run `context-sieve providers resolve <model>` to verify routing rules.
3. Check that the routing rule pattern comes before any catch-all.
4. Verify the provider is configured in `providers.yaml`.

**Route not matching:**

Glob patterns use [micromatch](https://github.com/micromatch/micromatch). Common issues:

- `*` matches everything within a segment (e.g., `gpt-*` matches `gpt-4o` but NOT `gpt-4o-turbo/vision`).
- `**` matches across segments.
- Patterns are case-sensitive. `GPT-*` does not match `gpt-4o`.

**All requests go to MockProvider:**

Your `providers.yaml` or `routing.yaml` may not be loading. Verify:

```bash
ls config/providers.yaml
ls config/routing.yaml
```

If the files don't exist, context-sieve uses defaults (MockProvider, no routing rules).

## FAQ

**Can a single model route to different providers at different times?**

No. Routing is decided once per request at the start of the forward stage. It stays fixed for the duration of that request.

**Can I route based on content, not just model name?**

Not currently. Routing is model-based only. Content-based routing would violate the separation between the execution layer and provider layer.

**What happens if the resolved provider fails?**

The forward stage returns an error stage result. The pipeline does not retry. Retry logic belongs in the client (OpenCode) or a future middleware layer.
