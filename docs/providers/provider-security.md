# Provider Security

## Principles

1. **Secrets never appear in logs.**
2. **Secrets never appear in error messages.**
3. **Secrets never appear in API responses.**
4. **The execution layer never sees provider credentials.**
5. **Transport isolation** — each provider has its own connection.
6. **Least privilege** — each API key has only the permissions it needs.

## Secret Handling

### What Is a Secret?

- API keys (`sk-...`, `sk-or-v1-...`)
- Auth tokens
- Bearer tokens
- Any value loaded from a `${ENV_VAR}` that represents credentials

### How Secrets Are Protected

**1. Environment Variable Interpolation**

API keys are never written in source code or YAML files. They are referenced as environment variables:

```yaml
# config/providers.yaml — safe to commit
providers:
  openai:
    apiKey: ${OPENAI_API_KEY}
```

The actual key lives in your shell environment:

```bash
export OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**2. [REDACTED] in Logs**

When the config loader reads provider configuration, it masks the `apiKey` field:

```
[config] openai baseUrl=https://api.openai.com apiKey=[REDACTED]
```

**3. [REDACTED] in Error Messages**

If a provider returns 401 Unauthorized, the error message includes the status code but not the API key:

```
[pipeline] stage=forward status=error meta={error: 'HTTP 401: Unauthorized'}
```

**4. [REDACTED] in Snapshots**

Run snapshots capture pipeline metadata but never include API keys or auth tokens.

### Setting Environment Variables

**Temporary (current terminal session):**

```bash
export OPENAI_API_KEY=sk-proj-xxxxxxxx
```

**Persistent (shell profile):**

```bash
echo 'export OPENAI_API_KEY=sk-proj-xxxxxxxx' >> ~/.zshrc
source ~/.zshrc
```

**Using a `.env` file:**

```bash
# .env
OPENAI_API_KEY=sk-proj-xxxxxxxx
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxx
```

Then source it before starting:

```bash
source .env && pnpm dev
```

**CI/CD (GitHub Actions):**

```yaml
- name: Start proxy
  run: pnpm dev
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

## Transport Isolation

### HTTPS

All communication between context-sieve and cloud providers uses HTTPS. API keys are sent in HTTP headers (Authorization: Bearer) which are encrypted by TLS.

### Local Providers

Ollama and LM Studio run on localhost. No TLS is needed because the traffic never leaves your machine.

```yaml
ollama:
  baseUrl: http://localhost:11434

lmstudio:
  baseUrl: http://localhost:1234
```

**Warning:** Never expose a local provider to the network without authentication. Ollama and LM Studio have no built-in auth.

### Provider Network Separation

Each provider gets its own fetch call. There is no shared connection pool or multiplexing between providers. This prevents cross-provider data leakage.

## API Key Scope

### Best Practices

**OpenAI:** Create project-specific API keys with restricted permissions:

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create a new key
3. Restrict to the models you use (e.g., GPT-4o-mini only)
4. Set a usage limit

**OpenRouter:** Use a single key but set spending limits:

1. Go to [openrouter.ai/keys](https://openrouter.ai/keys)
2. Set a monthly spending cap
3. Configure model access restrictions

## What NOT to Do

### ❌ Hardcoding Keys

```yaml
# BAD — never do this
providers:
  openai:
    apiKey: sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

This key is now in your git history forever. Even if you delete the file, it lives in the commit log.

### ❌ Logging Keys

```typescript
// BAD — never log API keys
console.log(`Using API key: ${config.apiKey}`)
```

### ❌ Keys in Errors

```typescript
// BAD — never include keys in error messages
throw new Error(`Provider returned 401 for key ${config.apiKey}`)
```

### ❌ Keys in Snapshots

```typescript
// BAD — never store keys in snapshots
snapshot.provider = {
  id: 'openai',
  apiKey: config.apiKey,  // ✗
}
```

## Security Architecture

```
┌──────────────────────────────────────────────────┐
│  OpenCode (client)                                │
│  OPENAI_API_KEY=anything (irrelevant)             │
└────────────────────┬─────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────┐
│  context-sieve                                    │
│                                                   │
│  Execution Layer — never sees API keys            │
│  Pipeline — pure context transformation           │
│                                                   │
│  Provider Layer — loads keys from env,            │
│  passes to adapter, keeps in memory               │
│  (never written to disk, never logged)            │
│                                                   │
│  Adapter — uses key for one HTTP call,            │
│  discards after request completes                 │
└────────────────────┬─────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────┐
│  Provider API (OpenAI, OpenRouter, etc.)          │
│  Authorization: Bearer sk-...                     │
│  HTTPS only                                      │
└──────────────────────────────────────────────────┘
```

## Incident Response

If you accidentally commit an API key:

1. **Revoke the key immediately** at the provider's dashboard.
2. **Generate a new key.**
3. **Rotate the key** in all environments.
4. **Use `git filter-branch` or `bfg`** to remove the key from git history if the repo is public.

## FAQ

**Q: Is it safe to commit `config/providers.yaml`?**
Yes, as long as all secret values use `${ENV_VAR}` syntax. The file contains references, not secrets.

**Q: What if I see `${VARIABLE}` in a log?**
The environment variable was not set. context-sieve shows the literal `${...}` pattern because interpolation produced an empty string.

**Q: Can someone steal keys from memory?**
In theory, yes — any process running as the same user can read `/proc/<pid>/environ`. In practice, this requires local access. Keep your machine secure.

**Q: Should I use different keys for development and production?**
Yes. Create separate API keys and configure them with different environment variables:

```yaml
# Development
openai:
  apiKey: ${DEV_OPENAI_API_KEY}

# Production
openai:
  apiKey: ${PROD_OPENAI_API_KEY}
```

**Q: What about encryption at rest?**
context-sieve does not persist API keys anywhere. They exist only in memory while the process is running.
