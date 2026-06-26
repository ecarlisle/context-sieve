# Overview

## What Is an Inference Provider?

An **inference provider** is a service or application that runs a language model and returns a completion. When you type a prompt in OpenCode and a response comes back, an inference provider did the work.

Examples of inference providers:

| Provider | Description |
|----------|-------------|
| **OpenAI** | Cloud API hosting GPT-4o, GPT-4o-mini, o-series models |
| **OpenRouter** | Single API that routes to dozens of models from many providers |
| **Anthropic** | Cloud API hosting Claude 3.5 Sonnet, Claude 3 Opus |
| **Ollama** | Local server running open-weight models (Llama, Mistral, Qwen) |
| **LM Studio** | Desktop app that runs local models via an OpenAI-compatible endpoint |
| **OpenCode Zen** | OpenCode's own inference service |

## What context-sieve Does

context-sieve sits **between** OpenCode (or any OpenAI-compatible client) and the inference provider. It intercepts every request, analyzes the context, removes redundancy, and then forwards the optimized request to the provider.

```
OpenCode
  │
  ▼
context-sieve
  │
  ▼ collects, measures, budgets, summarizes,
  │ prunes, deduplicates, compresses
  │
  ▼
Provider Router
  │
  ▼ resolves the right provider + model
  │
Inference Provider (OpenAI, OpenRouter, Ollama, …)
  │
  ▼
Model (GPT-4o, Claude 3.5, Llama 3, …)
```

## Why Provider Routing Exists

A single proxy needs to handle many scenarios:

- **Cost control** — Route expensive models to a cheap provider, cheap models to a fast provider.
- **Local development** — Use Ollama or LM Studio locally, switch to cloud providers in CI.
- **Fallback** — If one provider is down, route to another automatically.
- **Vendor flexibility** — Switch providers without changing your client configuration. Point every client at `http://localhost:3000/v1` and let the proxy decide where the request actually goes.
- **Experimentation** — Compare the same prompt across providers without changing code.

## Request Lifecycle

1. OpenCode sends a standard OpenAI chat-completion request to `http://localhost:3000/v1/chat/completions`.
2. context-sieve receives the request and runs it through the pipeline: collect, measure, budget, summarize, prune, dedupe, compress.
3. The **provider router** resolves which provider handles the request.
4. The resolved provider adapter normalizes the request into the provider's native format and sends it.
5. The provider's response is normalized back into the OpenAI format and returned through the pipeline.

## Supported Providers

| Provider | Adapter | Auth |
|----------|---------|------|
| OpenAI | `createOpenAIProvider` | `apiKey` |
| Anthropic | `createAnthropicProvider` | `apiKey` |
| OpenRouter | `createOpenRouterProvider` | `apiKey` |
| Ollama | `createOllamaProvider` | None (local) |
| LM Studio | `createLMStudioProvider` | None (local) |
| Mock | `MockProvider` | None (testing) |

## Quick Start

```bash
# Start context-sieve
pnpm dev

# Validate all configured providers
context-sieve providers list

# Test a specific provider
context-sieve providers test openrouter

# Resolve which provider handles a model
context-sieve providers resolve gpt-4o
```

## Troubleshooting

**Q: What if no provider is configured?**
The MockProvider handles every request. It returns a fixed response instantly without calling any external service.

**Q: Can I skip the pipeline and just route?**
No. The pipeline always runs. If you want minimal transformation, disable stages in `config/index.ts`.

**Q: Does the proxy add latency?**
The pipeline adds 5–50 ms of processing overhead. Provider latency (network + inference) dominates.
