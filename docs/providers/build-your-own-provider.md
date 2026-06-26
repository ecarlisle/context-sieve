# Build Your Own Provider

This tutorial walks you through creating a custom provider adapter from scratch. By the end, you'll have a fully functional provider that you can configure, route to, and test.

## What We're Building

We'll create `MyProvider` — a simple provider that prepends a custom prefix to every response. This teaches the adapter pattern without the complexity of real API calls.

## Prerequisites

- context-sieve installed and running
- Basic TypeScript knowledge
- A text editor

## Step 1: Create the Adapter File

Create a new file at `src/providers/adapters/my-provider.ts`:

```typescript
import type { InferenceProvider, ProviderConfig } from '../interface.js'
import type { ChatCompletionRequest, ChatCompletionResponse } from '../../types/index.js'

export function createMyProvider(config: ProviderConfig): InferenceProvider {
  const prefix = config.defaultModel ?? '[MyProvider]'

  return {
    id: 'my-provider',

    async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
      // Simulate network latency (100-300ms)
      const latency = Math.floor(Math.random() * 201) + 100
      await new Promise(resolve => setTimeout(resolve, latency))

      // Build a response
      const lastMessage = request.messages[request.messages.length - 1]
      const responseText = `${prefix} You said: "${lastMessage.content}"`

      return {
        id: `my-${Date.now()}`,
        content: responseText,
        outputTokenEstimate: responseText.length / 4,
        inputTokenEstimate: 0,
        delta: 0,
      }
    },
  }
}
```

**Explanation:**

- `config: ProviderConfig` — Receives the configuration from `providers.yaml`. We read `config.defaultModel` as a customizable prefix.
- `id: 'my-provider'` — This must match the provider ID used in `providers.yaml`.
- `chat()` — The only method required by `InferenceProvider`. It receives a `ChatCompletionRequest` and returns a `ChatCompletionResponse`.
- We simulate latency to mimic a real network call.
- We construct the response content from the last user message.

## Step 2: Register the Provider

Open `src/providers/registry.ts` and add an import and a case to the `createAdapter` method.

**Add the import:**

```typescript
import { createMyProvider } from './adapters/my-provider.js'
```

**Add the case:**

```typescript
case 'my-provider':
  return createMyProvider(config)
```

The registry's `createAdapter` method now looks like:

```typescript
private createAdapter(id: string, config: ProviderConfig): InferenceProvider | null {
  switch (id) {
    case 'mock':
      return new MockProvider()
    case 'openai':
      return createOpenAIProvider(config)
    case 'anthropic':
      return createAnthropicProvider(config)
    case 'openrouter':
      return createOpenRouterProvider(config)
    case 'ollama':
      return createOllamaProvider(config)
    case 'lmstudio':
      return createLMStudioProvider(config)
    case 'my-provider':
      return createMyProvider(config)
    default:
      return null
  }
}
```

## Step 3: Configure the Provider

Create or edit `config/providers.yaml`:

```yaml
default: my-provider

providers:
  my-provider:
    defaultModel: "🤖 Bot:"
```

The `defaultModel` field is our custom configuration. In `createMyProvider`, we read it as `config.defaultModel` and use it as the response prefix.

## Step 4: Add Routing (Optional)

If you want to route specific models to your provider, edit `config/routing.yaml`:

```yaml
routing:
  "my-*": my-provider
  "gpt-*": openrouter
  "*": openrouter
```

Now any request with a model starting with `my-` routes to MyProvider.

## Step 5: Validate

```bash
# Restart context-sieve
pnpm dev

# In another terminal, check the provider is registered
context-sieve providers list
```

Expected output:

```
Providers (2):
  my-provider [configured] routes=1
  openrouter [configured] routes=2

Default provider: my-provider

Routing rules (3):
  my-* -> my-provider
  gpt-* -> openrouter
  * -> openrouter
```

## Step 6: Test

```bash
context-sieve providers test my-provider
```

Expected output:

```
Testing provider "my-provider"...
  Reachable: yes
  Latency: 187ms
  Response: "🤖 Bot: You said: "Hello, respond with "OK" only.""
```

## Step 7: Send a Real Request

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "my-custom-model",
    "messages": [{"role": "user", "content": "Hello world!"}]
  }'
```

Response:

```json
{
  "id": "my-1712345678901",
  "content": "🤖 Bot: You said: \"Hello world!\"",
  "pipelineTrace": [
    {"stage": "forward", "status": "ok", "meta": {
      "providerId": "my-provider",
      "providerLatency": 187
    }}
  ],
  "runId": "snap-..."
}
```

## Full File: src/providers/adapters/my-provider.ts

```typescript
import type { InferenceProvider, ProviderConfig } from '../interface.js'
import type { ChatCompletionRequest, ChatCompletionResponse } from '../../types/index.js'

export function createMyProvider(config: ProviderConfig): InferenceProvider {
  const prefix = config.defaultModel ?? '[MyProvider]'

  return {
    id: 'my-provider',

    async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
      const latency = Math.floor(Math.random() * 201) + 100
      await new Promise(resolve => setTimeout(resolve, latency))

      const lastMessage = request.messages[request.messages.length - 1]
      const responseText = `${prefix} You said: "${lastMessage.content}"`

      return {
        id: `my-${Date.now()}`,
        content: responseText,
        outputTokenEstimate: responseText.length / 4,
        inputTokenEstimate: 0,
        delta: 0,
      }
    },
  }
}
```

## Going Further

Now that you've built a basic provider, you can extend it to:

- **Call a real API** — Replace the fake latency and response with an HTTP fetch to your model's endpoint. Follow the OpenAI adapter pattern for reference.
- **Handle streaming** — Implement streaming by returning chunks of content over time (see the server handler in `src/server/http.ts` for the streaming pattern).
- **Track real tokens** — If your API returns token counts in the response, use them instead of estimating.
- **Add custom headers** — Some providers require custom headers like `HTTP-Referer` (OpenRouter) or `anthropic-version` (Anthropic). Add them in the factory function.
- **Handle errors** — Catch HTTP errors and return descriptive messages. See the OpenAI adapter for error handling patterns.

## Checklist

- [ ] Provider ID is unique
- [ ] Factory function accepts `ProviderConfig`
- [ ] `createAdapter` case added in `ProviderRegistry`
- [ ] `providers.yaml` configuration added
- [ ] `routing.yaml` updated (optional)
- [ ] `context-sieve providers list` shows the new provider
- [ ] `context-sieve providers test <id>` succeeds
- [ ] Requests route to the correct provider
