# Provider Setup Guide

## Overview

Configure real inference providers (OpenAI, Anthropic, etc.) to replace the default mock provider.

## Configuration Files

Providers are configured in `config/providers.yaml`:

```yaml
# config/providers.yaml
default: openai
providers:
  openai:
    baseUrl: "https://api.openai.com"
    apiKey: "${OPENAI_API_KEY}"
    defaultModel: "gpt-4o-mini"
  anthropic:
    baseUrl: "https://api.anthropic.com"
    apiKey: "${ANTHROPIC_API_KEY}"
    defaultModel: "claude-sonnet-4-20250514"
```

Routing rules go in `config/routing.yaml`:

```yaml
# config/routing.yaml
routing:
  "gpt-4*": "openai"
  "claude-*": "anthropic"
  "o1-*": "openai"
  "*": "openai"
```

## Step-by-Step

### 1. Set Environment Variables

```bash
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
```

### 2. Create Configuration

```bash
mkdir -p config
```

Create `config/providers.yaml` and `config/routing.yaml` with the templates above.

### 3. Validate Configuration

```bash
npx tsx src/index.ts providers list
# → openai [configured] routes=2
# → anthropic [configured] routes=1
```

### 4. Test Connectivity

```bash
# Test a specific provider
npx tsx src/index.ts providers validate openai

# Or validate all at once
npx tsx src/index.ts providers validate
```

### 5. Send a Test Request

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Hello"}]}'
```

### 6. Override Provider Per-Request

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet-4-20250514","messages":[{"role":"user","content":"Hello"}],"provider":"anthropic"}'
```

See [Provider Selection](../providers/selection.md) for the resolution chain.

## Supported Providers

| Provider | Adapter | Auth |
|---|---|---|
| OpenAI | `createOpenAIProvider` | Bearer token |
| Anthropic | `createAnthropicProvider` | x-api-key header |
| OpenRouter | `createOpenRouterProvider` | Bearer token |
| Ollama | `createOllamaProvider` | None (localhost) |
| LM Studio | `createLMStudioProvider` | None (localhost) |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Provider not found | Missing provider block in YAML | Add provider config |
| Route not matching | Pattern mismatch | Check micromatch pattern |
| 401/403 on validate | Missing or invalid API key | Check env vars are set |
| Connection refused | Provider not running (Ollama/LM Studio) | Start the local server |
