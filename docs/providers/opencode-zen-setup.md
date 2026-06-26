# Route OpenCode to OpenCode Zen

This guide explains two ways to connect context-sieve to OpenCode Zen:

- **Case A:** OpenCode Zen provides an OpenAI-compatible endpoint.
- **Case B:** OpenCode Zen uses a custom protocol that requires an adapter.

## What Is OpenCode Zen?

OpenCode Zen is OpenCode's managed inference service. It provides access to optimized models through a dedicated API.

## Case A: OpenAI-Compatible Endpoint

If OpenCode Zen exposes an OpenAI-compatible `/v1/chat/completions` endpoint, you can use the existing OpenAI adapter. No custom code needed.

### Configuration

```yaml
# config/providers.yaml
default: opencode-zen

providers:
  opencode-zen:
    baseUrl: https://zen.opencode.ai
    apiKey: ${OPENCODE_ZEN_API_KEY}
    defaultModel: opencode-zen-1
```

### Request Flow

```
OpenCode
  │
  │ POST /v1/chat/completions (model="opencode-zen-1")
  ▼
context-sieve
  │
  │ ProviderRegistry resolves → opencode-zen
  │
  │ OpenAI adapter normalizes request
  │   → POST https://zen.opencode.ai/v1/chat/completions
  │   → Authorization: Bearer sk-zen-...
  │
  ▼
OpenCode Zen API
  │
  ▼
Model
```

### Routing

```yaml
# config/routing.yaml
routing:
  "opencode-zen-*": opencode-zen
  "gpt-*": openrouter
  "*": opencode-zen
```

### Verification

```bash
context-sieve providers test opencode-zen
```

Expected output:

```
Testing provider "opencode-zen"...
  Reachable: yes
  Latency: 634ms
  Response: "Hello! I'm OpenCode Zen."
```

## Case B: Custom Protocol

If OpenCode Zen uses a non-standard API (gRPC, WebSocket, proprietary format), you need a custom adapter.

### How Adapter Normalization Works

Every adapter does two things:

1. **Request normalization:** Convert the standard `ChatCompletionRequest` into the provider's native format.
2. **Response normalization:** Convert the provider's native response into `ChatCompletionResponse`.

```
Standard Request                    Standard Response
┌─────────────────────┐            ┌──────────────────────┐
│ model: string       │            │ id: string           │
│ messages: [...]     │   ┌───┐    │ content: string      │
│ stream?: boolean    │──▶│ A │───▶│ outputTokenEstimate   │
│ max_tokens?: number │   │ d │    │ inputTokenEstimate    │
│ temperature?: number│   │ a │    │ delta: number        │
└─────────────────────┘   │ p │    └──────────────────────┘
                          │ t │
 Provider Native Request  │ e │   Provider Native Response
┌─────────────────────┐   │ r │   ┌──────────────────────┐
│ model: string       │   └───┘   │ id: string           │
│ messages: [...]     │◀─────────▶│ content: string      │
│ ... provider fields │           │ ... provider fields  │
└─────────────────────┘           └──────────────────────┘
```

### Building a Custom Adapter for OpenCode Zen

Create `src/providers/adapters/opencode-zen.ts`:

```typescript
import type { InferenceProvider, ProviderConfig } from '../interface.js'
import type { ChatCompletionRequest, ChatCompletionResponse } from '../../types/index.js'

export function createOpenCodeZenProvider(config: ProviderConfig): InferenceProvider {
  const baseUrl = config.baseUrl ?? 'https://zen.opencode.ai'

  return {
    id: 'opencode-zen',
    async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
      // 1. Normalize request to OpenCode Zen format
      const zenRequest = {
        prompt: request.messages.map(m => `${m.role}: ${m.content}`).join('\n'),
        model: request.model,
        maxTokens: request.max_tokens ?? 2048,
      }

      // 2. Send to OpenCode Zen API
      const start = Date.now()
      const res = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(zenRequest),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`OpenCode Zen HTTP ${res.status}: ${text}`)
      }

      const zenResponse = await res.json() as { text: string; tokens: number }

      // 3. Normalize response to standard format
      return {
        id: `zen-${Date.now()}`,
        content: zenResponse.text,
        outputTokenEstimate: zenResponse.tokens,
        inputTokenEstimate: 0,
        delta: 0,
      }
    },
  }
}
```

### Register the Adapter

In `src/providers/registry.ts`, add the new provider to the `createAdapter` method:

```typescript
case 'opencode-zen':
  return createOpenCodeZenProvider(config)
```

### Configuration

Now configure it like any other provider:

```yaml
# config/providers.yaml
default: opencode-zen

providers:
  opencode-zen:
    baseUrl: https://zen.opencode.ai
    apiKey: ${OPENCODE_ZEN_API_KEY}
```

## Comparison

| Aspect | Case A (OpenAI-compatible) | Case B (Custom Protocol) |
|--------|---------------------------|--------------------------|
| Effort | Zero — use existing OpenAI adapter | Write ~40 lines of adapter code |
| Maintenance | None | Keep adapter in sync with API changes |
| Features | Streaming, tokens, everything OpenAI supports | Whatever you implement |
| Risk | Low — proven path | Higher — you own the integration |

## Recommendation

Start with Case A. If OpenCode Zen changes its API or adds features the OpenAI adapter can't handle, move to Case B.

## Troubleshooting

**Case A: 404 Not Found:**

OpenCode Zen may not expose `/v1/chat/completions` at the expected path. Check their API documentation and update `baseUrl` accordingly:

```yaml
opencode-zen:
  baseUrl: https://zen.opencode.ai/v2
```

**Case B: Adapter errors:**

The adapter runs inside the context-sieve process. Check verbose logs:

```bash
context-sieve --verbose
```

Look for `[provider]` lines. If the adapter throws, the error appears in the forward stage trace:

```json
{"stage": "forward", "status": "error", "meta": {"error": "HTTP 400: Bad Request"}}
```

**Neither case works:**

OpenCode Zen may not be publicly available yet. Check with the OpenCode team for API access and documentation.
