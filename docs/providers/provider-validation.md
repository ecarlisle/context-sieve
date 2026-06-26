# Provider Validation

## Overview

context-sieve provides two CLI commands to validate provider configuration:

- `context-sieve providers list` — Show all configured providers and routing rules.
- `context-sieve providers test <id>` — Send a real request to a provider and report connectivity.
- `context-sieve providers resolve <model>` — Show which provider a model routes to.

## Validate Configuration

### Listing Providers

```bash
context-sieve providers list
```

**Happy path — all providers configured:**

```
Providers (4):
  openai [configured] routes=2
  anthropic [configured] routes=1
  openrouter [configured] routes=3
  ollama [configured] routes=0

Default provider: openrouter

Routing rules (6):
  gpt-* -> openai
  gpt-4o-mini -> openrouter
  claude-* -> anthropic
  llama-* -> ollama
  mistral-* -> openrouter
  * -> openrouter
```

**Missing config file — defaults used:**

```
Providers (1):
  mock [configured] routes=0

Default provider: mock

Routing rules (0):
```

This means `config/providers.yaml` was not found or is empty.

**Broken config file:**

If the YAML is invalid, the process crashes at startup with a parse error:

```
Error: Invalid YAML in config/providers.yaml: mapping values are not allowed here
```

### Testing a Provider

```bash
context-sieve providers test openrouter
```

**Reachable:**

```
Testing provider "openrouter"...
  Reachable: yes
  Latency: 842ms
  Response: "Hello! How can I help you today?"
```

**Unreachable — wrong URL:**

```
Testing provider "openrouter"...
  Reachable: no
  Error: fetch failed: connect ECONNREFUSED api.openrouter.ai:443
```

**Unreachable — bad auth:**

```
Testing provider "openrouter"...
  Reachable: no
  Error: HTTP 401: {"error":{"message":"Incorrect API key","code":"unauthorized"}}
```

**Provider not found:**

```
Testing provider "nonexistent"...
  Error: Provider not found: nonexistent
```

### Verbose Test Output

Pass `--verbose` for detailed metrics:

```bash
context-sieve providers test openrouter --verbose
```

```
Testing provider "openrouter"...
  Reachable: yes
  Latency: 842ms
  Response: "Hello! How can I help you today?"
  Input tokens: 18
  Output tokens: 8
```

### Resolving Model Routing

```bash
context-sieve providers resolve gpt-4o
```

```
Model "gpt-4o" -> provider "openrouter"
```

Test with a model that has no matching rule:

```bash
context-sieve providers resolve unknown-model
```

```
Model "unknown-model" -> provider "openrouter"
```

(default provider is used as fallback)

## Automated Validation in CI

Add validation to your CI pipeline:

```yaml
# .github/workflows/validate.yml
steps:
  - run: pnpm install
  - run: pnpm build
  - run: context-sieve providers list
  - run: context-sieve providers test openai
  - run: context-sieve providers test anthropic
```

## Validation Flow Diagram

```
context-sieve providers test openrouter
  │
  ▼
Load providers.yaml ──► Parse YAML
  │                       │
  │                   ┌───┴───┐
  │                   │ valid │
  │                   └───┬───┘
  │                       │ yes
  ▼                       ▼
Resolve provider     ┌──────────────────────┐
  │                  │ "openrouter" found   │
  ▼                  │ in providers map     │
Get adapter          └──────────┬───────────┘
  │                             │ yes
  ▼                             ▼
Send test request    ┌──────────────────────┐
  │                  │ POST /v1/chat/       │
  │                  │ completions          │
  ▼                  │ model=gpt-4o-mini    │
Parse response       └──────────┬───────────┘
  │                             │
  ▼                             ▼
Print result         ┌──────────────────────┐
                     │ 200 OK               │
                     │ "Hello! How can I..."│
                     └──────────────────────┘
```

## Failure Mode Reference

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `Provider not found` | Typo in provider ID | Check `providers list` for valid IDs |
| `HTTP 401` | Invalid or missing API key | Check `echo $PROVIDER_API_KEY` |
| `HTTP 403` | API key lacks permissions | Check provider dashboard for key scope |
| `HTTP 429` | Rate limited | Wait, or add credits to your account |
| `ECONNREFUSED` | Wrong baseUrl or provider down | Check `baseUrl` in config |
| `ETIMEOUT` | Network issue | Check internet connectivity, firewall, proxy |
| `Parse error` | Invalid YAML | Validate with `yamlint config/providers.yaml` |
| All tests pass but OpenCode fails | OpenCode not pointing at proxy | Check `OPENAI_BASE_URL` |

## Validation Checklist

Before filing a bug or asking for help:

- [ ] `context-sieve providers list` shows the expected providers
- [ ] `context-sieve providers test <id>` succeeds for each provider
- [ ] `context-sieve providers resolve <model>` returns the expected provider
- [ ] `context-sieve --verbose` shows no config errors at startup
- [ ] `config/providers.yaml` exists and has valid YAML
- [ ] `config/routing.yaml` exists and has valid YAML
- [ ] Environment variables are set (`echo $PROVIDER_API_KEY` returns a value)
- [ ] OpenCode has `OPENAI_BASE_URL=http://localhost:3000/v1`
