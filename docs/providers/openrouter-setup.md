# Route OpenCode to OpenRouter

This guide explains how to configure context-sieve to route requests through OpenRouter, giving you access to dozens of models from a single API key.

## What OpenRouter Provides

OpenRouter is a unified API that gives you access to models from many providers:

| Feature | Detail |
|---------|--------|
| Models | GPT-4o, Claude 3.5, Gemini, Llama, Mistral, DeepSeek, and 200+ more |
| Billing | Pay-per-token, no monthly commitments |
| Fallback | Automatically retries on different providers if one is down |
| Crediting | One API key, one billing relationship |

## Prerequisites

- An OpenRouter account and API key: [openrouter.ai/keys](https://openrouter.ai/keys)
- context-sieve installed and running (see [Overview](./overview.md))

## Step 1: Configure OpenRouter

Create `config/providers.yaml`:

```yaml
default: openrouter

providers:
  openrouter:
    baseUrl: https://openrouter.ai/api
    apiKey: ${OPENROUTER_API_KEY}
```

Set your API key:

```bash
export OPENROUTER_API_KEY="your_openrouter_api_key_here"
```

**Note:** Never commit real API keys. Use environment variables only.

## Step 2: Configure Routing

Create `config/routing.yaml`:

```yaml
routing:
  "gpt-*": openrouter
  "claude-*": openrouter
  "llama-*": openrouter
  "mistral-*": openrouter
  "*": openrouter
```

This routes all models through OpenRouter. You can add more specific rules later.

## Step 3: Validate Configuration

```bash
# Restart context-sieve
pnpm dev

# In another terminal, verify the provider is configured
context-sieve providers list
```

Expected output:

```
Providers (1):
  openrouter [configured] routes=5

Default provider: openrouter

Routing rules (5):
  gpt-* -> openrouter
  claude-* -> openrouter
  llama-* -> openrouter
  mistral-* -> openrouter
  * -> openrouter
```

## Step 4: Test the Connection

```bash
context-sieve providers test openrouter --verbose
```

Expected output:

```
Testing provider "openrouter"...
  Reachable: yes
  Latency: 842ms
  Response: "Hello! How can I help you today?"
  Input tokens: 18
  Output tokens: 8
```

If the test fails:

```
Testing provider "openrouter"...
  Reachable: no
  Error: HTTP 401: {"error":"Unauthorized"}
```

Your API key is invalid or not set. Check:
 
 ```bash
 echo $OPENROUTER_API_KEY
 ```

## Step 5: Send a Request

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {
        "role": "user", 
        "content": "What is 2+2?"
      }
    ]
  }'
```

The response includes pipeline metadata:

```json
{
  "id": "chatcmpl-...",
  "content": "2+2 = 4",
  "pipelineTrace": [
    {"stage": "forward", "status": "ok", "meta": {
      "providerId": "openrouter",
      "providerLatency": 842
    }}
  ],
  "runId": "snap-1712345678901-a1b2c3"
}
```

## Request Flow

```
OpenCode
  │
  │ POST /v1/chat/completions (model="gpt-4o")
  ▼
context-sieve
  │
  │ Pipeline (collect, measure, budget, ...)
  │
  │ ProviderRegistry.resolve("gpt-4o")
  │   → routing rule "gpt-*" matches
  │   → returns openrouter adapter
  │
  │ OpenRouter adapter normalizes request
  │   → POST https://openrouter.ai/api/v1/chat/completions
  │   → Authorization: Bearer sk-or-v1-...
  │
  ▼
OpenRouter API
  │
  │ Routes to the best provider for gpt-4o
  ▼
Model (GPT-4o on Azure, OpenAI, or fallback)
```

## Troubleshooting

**401 Unauthorized:**

Double-check your API key:

```bash
echo ${#OPENROUTER_API_KEY}  # Should print the key length (usually 60+)
```

If empty, set it:

```bash
export OPENROUTER_API_KEY="your_openrouter_api_key_here"
```

Add this to your `.zshrc`, `.bashrc`, or `.env` file so it persists.

**402 Payment Required:**

Your OpenRouter account has insufficient credits. Add credits at [openrouter.ai/credits](https://openrouter.ai/credits).

**429 Too Many Requests:**

OpenRouter rate-limits free-tier accounts. Wait a few seconds and retry. Consider adding credits to increase your rate limit.

**Model not found:**

The model name differs between OpenRouter and your client. OpenRouter uses model names like `openai/gpt-4o`, `anthropic/claude-3.5-sonnet`. Check the [OpenRouter models list](https://openrouter.ai/models) for the exact name.

If your client sends `gpt-4o` but OpenRouter expects `openai/gpt-4o`, add a routing override in the request:

```json
{
  "model": "openai/gpt-4o",
  "provider": "openrouter"
}
```

**High latency:**

OpenRouter adds its own routing latency on top of provider latency. Enable verbose mode to see the breakdown:

```bash
context-sieve --verbose
```

Look for:

```
[provider] resolved=openrouter latency=1852ms
```

Typical OpenRouter latency is 500-2000ms for the first request (cold start) and 200-800ms for subsequent requests.
