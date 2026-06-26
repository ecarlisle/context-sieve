# Multi-Run CLI Guide

## Commands

### `context-sieve multirun run`

Execute the same request across multiple providers.

```bash
context-sieve multirun run \
  --providers openai,anthropic,openrouter \
  --model gpt-4o-mini \
  --message "Explain the difference between TCP and UDP."
```

**Options:**

| Flag | Required | Description |
|------|----------|-------------|
| `--providers` | Yes | Comma-separated list of provider IDs |
| `--model` | No | Model name (default: gpt-4o-mini) |
| `--message` | No | Message to send (default: greeting) |

**Output:**

```
Running across providers: openai, anthropic, openrouter
Model: gpt-4o-mini
Message: "Explain the difference between TCP and UDP."

Group ID: mrun-1740000000-abc123
Runs: 3

  openai: id=snap-1740000000-xxx tokens=142 latency=1234ms
    response: "TCP is connection-oriented..."

  anthropic: id=snap-1740000001-yyy tokens=178 latency=890ms
    response: "TCP (Transmission Control Protocol)..."

  openrouter: id=snap-1740000002-zzz tokens=95 latency=2100ms
    response: "TCP provides reliable..."

Divergence Score: 24.5%
Token Variance: 18.2%
Latency Variance: 605ms

Provider Ranking:
  1. anthropic: score=85
  2. openai: score=72
  3. openrouter: score=58
```

### `context-sieve multirun compare`

Compare existing snapshots from a multi-run group.

```bash
context-sieve multirun compare --ids snap-xxx,snap-yyy,snap-zzz
```

**Options:**

| Flag | Required | Description |
|------|----------|-------------|
| `--ids` | Yes | Comma-separated list of snapshot IDs |

**Output:**

```
Comparison Report (3 runs):
Divergence Score: 24.5%
Token Variance: 18.2%
Latency Variance: 605ms

Prune Decisions:
  openai: removed=3 shadow=true
  anthropic: removed=3 shadow=true
  openrouter: removed=3 shadow=true

Output Range:
  Tokens: 95–178 (avg 138)
  Latency: 890ms–2100ms (avg 1408ms)

Provider Ranking:
  1. anthropic: score=85
  2. openai: score=72
  3. openrouter: score=58
```

---

## API Equivalent

```bash
# POST /api/multirun
curl -X POST http://localhost:3000/api/multirun \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello"}],
    "providers": ["openai", "anthropic"]
  }'
```

```bash
# POST /api/multirun/compare
curl -X POST http://localhost:3000/api/multirun/compare \
  -H "Content-Type: application/json" \
  -d '{"runIds": ["snap-xxx", "snap-yyy", "snap-zzz"]}'
```

---

## Common Patterns

### Compare specific providers only

```bash
context-sieve multirun run \
  --providers openai,anthropic \
  --model claude-3-5-sonnet \
  --message "Write a haiku about distributed systems."
```

### Compare all configured providers

```bash
# List providers, then pass all non-mock
context-sieve providers list
context-sieve multirun run \
  --providers openai,anthropic,openrouter,ollama \
  --model gpt-4o-mini \
  --message "Hello"
```

### Re-analyze a previous group

```bash
# Find group members
context-sieve search --text "mrun-1740000000"

# Compare specific snapshots
context-sieve multirun compare --ids snap-xxx,snap-yyy,snap-zzz
```
