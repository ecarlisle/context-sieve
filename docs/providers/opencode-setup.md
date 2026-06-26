# Connect OpenCode Through context-sieve

This guide explains how to configure OpenCode to send all requests through context-sieve instead of directly to OpenAI.

## Overview

OpenCode sends requests to an OpenAI-compatible API. context-sieve exposes an OpenAI-compatible endpoint at `http://localhost:3000/v1`. By changing OpenCode's base URL configuration, every request flows through the proxy.

```
Before:
OpenCode ──► api.openai.com

After:
OpenCode ──► context-sieve (localhost:3000) ──► Provider
```

## Step 1: Install and Start context-sieve

```bash
# Clone and install
git clone <repo-url> context-sieve
cd context-sieve
pnpm install

# Start the proxy
pnpm dev
```

Expected output:

```
context-sieve running on http://localhost:3000
```

Leave this terminal running. Open a second terminal for the next steps.

## Step 2: Configure OpenCode

OpenCode reads standard OpenAI environment variables. Set them to point at context-sieve:

```bash
export OPENAI_BASE_URL=http://localhost:3000/v1
export OPENAI_API_KEY=anything
```

**Explanation of each variable:**

| Variable | Value | Why |
|----------|-------|-----|
| `OPENAI_BASE_URL` | `http://localhost:3000/v1` | OpenCode sends requests here instead of `https://api.openai.com/v1`. The `/v1` suffix matches the OpenAI API path. |
| `OPENAI_API_KEY` | `anything` | context-sieve accepts any value. The proxy uses its own API keys (configured in `providers.yaml`). OpenCode requires *some* value to be set; it doesn't matter what. |

**Important:** The API key you set here (`anything`) is NOT sent to the upstream provider. context-sieve ignores it and uses the key from `providers.yaml`.

## Step 3: Verify the Connection

Send a test request through context-sieve:

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Say hello in one word"}]
  }'
```

Expected response (with MockProvider):

```json
{
  "id": "cmpl-...",
  "content": "This is a mock response from context-sieve.",
  "pipelineTrace": [...],
  "runId": "snap-..."
}
```

If you've configured a real provider (e.g., OpenRouter), you'll get a real response:

```json
{
  "id": "chatcmpl-...",
  "content": "Hello!",
  "pipelineTrace": [...],
  "runId": "snap-..."
}
```

## Step 4: Configure a Real Provider

By default, context-sieve uses MockProvider. To get real responses, configure a provider:

1. Create `config/providers.yaml`:

```yaml
default: openrouter
providers:
  openrouter:
    apiKey: ${OPENROUTER_API_KEY}
```

2. Set your API key:

```bash
export OPENROUTER_API_KEY=sk-or-v1-xxxxxxxx
```

3. Restart context-sieve (Ctrl+C, then `pnpm dev`).

4. Verify:

```bash
context-sieve providers list
```

You should see `openrouter [configured]` in the list.

## Step 5: Use OpenCode

Start OpenCode with the environment variables set:

```bash
OPENAI_BASE_URL=http://localhost:3000/v1 \
OPENAI_API_KEY=anything \
opencode
```

Every prompt you send in OpenCode now flows through context-sieve.

## Step 6: Validate with the Pipeline

context-sieve records every request as a run snapshot. View recent runs:

```bash
# List recent snapshots
ls data/snapshots/

# Inspect a specific run
context-sieve inspect <run-id>

# Search runs
context-sieve search --text "hello"
```

## Troubleshooting

**OpenCode says "Connection refused":**

context-sieve is not running. Start it with `pnpm dev`.

**OpenCode says "Authentication failed":**

You didn't set `OPENAI_API_KEY`. Set it to any value:

```bash
export OPENAI_API_KEY=anything
```

**Responses are the same every time:**

MockProvider is active. Configure a real provider in `providers.yaml`.

**Requests are slow:**

The pipeline adds some overhead. Check timing in the verbose log:

```bash
context-sieve --verbose
```

Look for lines like:

```
[provider] resolved=openrouter latency=842ms
```

If provider latency is high, the issue is upstream, not in the proxy.

**OpenCode ignores OPENAI_BASE_URL:**

Some OpenCode versions use different variable names. Check OpenCode's documentation for the correct environment variables. Common alternatives:

- `OPENAI_HOST`
- `OPENAI_ENDPOINT`
- `OPENAI_API_BASE`
