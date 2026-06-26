# Provider Adapters

> **See also:** [Build Your Own Provider](build-your-own-provider.md) for implementing custom provider adapters.

## What Is an Adapter?

An adapter is a function that implements the `InferenceProvider` interface. It knows how to:

1. Take a standard `ChatCompletionRequest`.
2. Convert it to the provider's native API format.
3. Send the HTTP request with correct auth and headers.
4. Parse the provider's response.
5. Convert it back to a standard `ChatCompletionResponse`.

```
┌──────────────────────┐
│  ChatCompletionRequest │
│  (standard format)     │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Adapter              │
│                       │
│  • normalize request  │
│  • send HTTP          │
│  • normalize response │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  ChatCompletionResponse│
│  (standard format)     │
└──────────────────────┘
```

## The InferenceProvider Interface

Every adapter implements this interface:

```typescript
interface InferenceProvider {
  /** Unique identifier used in config and routing */
  id: string

  /** Send a chat completion request and return a response */
  chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse>
}
```

### ChatCompletionRequest

```typescript
interface ChatCompletionRequest {
  model: string                    // e.g., "gpt-4o-mini"
  messages: ChatMessage[]          // [{role, content}, ...]
  stream?: boolean                 // Whether to stream the response
  max_tokens?: number              // Maximum tokens to generate
  temperature?: number             // Sampling temperature (0-2)
  provider?: string                // Explicit provider override
}
```

### ChatCompletionResponse

```typescript
interface ChatCompletionResponse {
  id: string                       // Response identifier
  content: string                  // Generated text
  outputTokenEstimate: number      // Estimated output tokens
  inputTokenEstimate: number       // Estimated input tokens
  delta: number                    // (output - input) token difference
}
```

## Built-in Adapters

### OpenAI Adapter

**File:** `src/providers/adapters/index.ts` — `createOpenAIProvider()`

The OpenAI adapter is the reference implementation. It maps directly to the [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat).

**Request normalization:**

```typescript
// Standard → OpenAI (nearly 1:1 mapping)
{
  model: request.model,
  messages: request.messages,
  max_tokens: request.max_tokens,
  temperature: request.temperature,
  stream: request.stream,
}
```

**Response normalization:**

```typescript
// OpenAI → Standard
{
  id: json.id,
  content: json.choices[0].message.content,
  outputTokenEstimate: json.usage.completion_tokens,
  inputTokenEstimate: json.usage.prompt_tokens,
  delta: json.usage.total_tokens - json.usage.prompt_tokens,
}
```

### Anthropic Adapter

**File:** `src/providers/adapters/index.ts` — `createAnthropicProvider()`

Anthropic uses a different API format than OpenAI.

**Request normalization:**

```typescript
// Standard → Anthropic Messages API
{
  model: request.model,
  max_tokens: request.max_tokens ?? 1024,
  messages: request.messages.map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content
  })),
}
```

**Key differences from OpenAI:**
- `max_tokens` is required (Anthropic doesn't have a default)
- `system` role must be sent differently (omitted in basic adapter)
- Response format uses `content[0].text` instead of `choices[0].message.content`

**Response normalization:**

```typescript
// Anthropic → Standard
{
  id: json.id,
  content: json.content[0].text,
  outputTokenEstimate: json.usage.output_tokens,
  inputTokenEstimate: json.usage.input_tokens,
  delta: 0,
}
```

### OpenRouter Adapter

**File:** `src/providers/adapters/index.ts` — `createOpenRouterProvider()`

OpenRouter uses the OpenAI format, so normalization is identical to the OpenAI adapter. The only difference is:

- Custom `HTTP-Referer` header for OpenRouter rankings
- Different base URL: `https://openrouter.ai/api`

### Ollama Adapter

**File:** `src/providers/adapters/index.ts` — `createOllamaProvider()`

Ollama uses a different API entirely.

**Request normalization:**

```typescript
// Standard → Ollama Chat API
{
  model: request.model,
  messages: request.messages,
  stream: false,  // Ollama streaming is handled differently
}
```

**Key differences:**
- No auth required (local only)
- No token usage returned (estimated from content length)
- Different endpoint: `/api/chat` instead of `/v1/chat/completions`

### LM Studio Adapter

**File:** `src/providers/adapters/index.ts` — `createLMStudioProvider()`

LM Studio exposes an OpenAI-compatible endpoint, so normalization is identical to the OpenAI adapter.

## Adapter Factory Pattern

Each adapter is created by a factory function:

```typescript
export function createOpenAIProvider(config: ProviderConfig): InferenceProvider {
  // config.baseUrl — overridable in providers.yaml
  // config.apiKey — loaded with env interpolation
  // config.defaultModel — not used at adapter level

  return {
    id: 'openai',
    async chat(request) {
      // ... implementation
    },
  }
}
```

The factory is called by `ProviderRegistry` during construction:

```typescript
case 'openai':
  return createOpenAIProvider(config)
```

## How Request Normalization Works

Each adapter goes through these steps:

```
1. Extract fields from ChatCompletionRequest
       │
2. Map model name (if different in target provider)
       │
3. Map role names (e.g., "system" → Anthropic format)
       │
4. Construct provider-native request body
       │
5. Add auth headers
       │
6. POST to provider API
       │
7. Parse response
       │
8. Map response fields back to ChatCompletionResponse
```

## How Response Normalization Works

```
1. Read HTTP status code
       │
2. Parse JSON body
       │
3. Extract text content
       │
4. Extract or estimate token counts
       │
5. Construct ChatCompletionResponse
```

If the provider doesn't return token counts (Ollama, LM Studio), the adapter estimates them:

```typescript
outputTokenEstimate: content.length / 4  // ~4 chars per token
```

## Create Your First Adapter

See [Build Your Own Provider](./build-your-own-provider.md) for a step-by-step tutorial.

## Adapter Contract

Every adapter must:

1. **Handle errors gracefully.** Return a descriptive error message if the provider is unreachable or returns an error.
2. **Not modify the original request.** Build a new object for the provider-native request.
3. **Report latency.** Track `Date.now()` before and after the HTTP call (the forward stage captures this).
4. **Estimate tokens.** If the provider doesn't return token usage, estimate from content length.
5. **Not log secrets.** Never include `config.apiKey` in log messages or errors.

## Adapter Checklist

Before shipping an adapter:

- [ ] Is `id` unique and consistent with `providers.yaml`?
- [ ] Does the factory accept `ProviderConfig`?
- [ ] Are all request fields mapped correctly?
- [ ] Are all response fields mapped correctly?
- [ ] Are errors caught and returned as descriptive messages?
- [ ] Are token counts handled (real or estimated)?
- [ ] Is latency measured?
- [ ] Are API keys never logged?
- [ ] Can it be tested with `context-sieve providers test <id>`?
