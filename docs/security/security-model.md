# Security Model

## Principles

1. **Least privilege.** Every component has the minimum access needed.
2. **Defense in depth.** Multiple layers protect secrets and data.
3. **No persistent secrets.** API keys live in environment variables, never in files.
4. **Auditability.** All access to sensitive operations is recorded in snapshots.
5. **Separation of concerns.** The execution layer never sees credentials; the provider layer never sees pipeline internals.

---

## Secrets Handling

### Where Secrets Live

| Secret | Location | Persistence |
|--------|----------|-------------|
| Provider API keys | Environment variables (`${OPENAI_API_KEY}`) | Not persisted by context-sieve |
| Client API key (OpenCode) | `OPENAI_API_KEY` env var | Passed through, not validated |
| Plugin credentials | Plugin configuration | Plugin responsibility |

### How Secrets Flow

```
1. Environment variable
   export OPENAI_API_KEY=sk-proj-xxxxxxxx
        │
2. Config loader reads providers.yaml
   apiKey: ${OPENAI_API_KEY}
        │
        │ interpolation replaces ${...} with env value
        ▼
3. ProviderConfig in memory
   { apiKey: "sk-proj-xxxxxxxx", baseUrl: "..." }
        │
4. Adapter factory receives config
   createOpenAIProvider(config)
        │
        │ adapter stores reference for the lifetime of the process
        ▼
5. HTTP request
   Authorization: Bearer sk-proj-xxxxxxxx
        │
        │ TLS-encrypted to the provider
        ▼
6. Provider API
```

### What Is Logged

| Context | API Key in Log? |
|---------|----------------|
| Config loading | `[REDACTED]` |
| Pipeline trace | Not included |
| Error messages | Not included |
| Snapshots | Not included |
| Metrics | Not included |
| Replay artifacts | Not included |

### What Is NOT Logged

The config loader explicitly masks `apiKey` values:

```typescript
console.log(`[config] ${id} baseUrl=${cfg.baseUrl} apiKey=[REDACTED]`)
```

If you see an API key in a log, it is a bug. Report it.

---

## API Key Isolation

### Client-Side Key

OpenCode sends `OPENAI_API_KEY=anything`. This value is accepted but never used. The proxy ignores it and uses its own configured keys.

```
OpenCode
  OPENAI_API_KEY=anything
        │
        ▼
context-sieve
  Ignores the client key.
  Uses keys from providers.yaml.
        │
        ▼
Provider API
  Receives: Authorization: Bearer sk-real-key
```

### Provider Key Separation

Each provider has its own API key:

```yaml
providers:
  openai:      # uses ${OPENAI_API_KEY}
  openrouter:  # uses ${OPENROUTER_API_KEY}
  anthropic:   # uses ${ANTHROPIC_API_KEY}
```

A key configured for one provider is never sent to another provider. The adapter factory only passes the relevant config:

```typescript
case 'openai':
  return createOpenAIProvider(openaiConfig)  // only has openai's key
case 'anthropic':
  return createAnthropicProvider(anthropicConfig)  // only has anthropic's key
```

---

## Logging Restrictions

### What May Be Logged

- Stage names and statuses
- Token counts (estimates)
- Provider IDs and model names
- Latency metrics
- Error messages (without secrets)
- Pipeline configuration (without secrets)

### What Must NOT Be Logged

- API keys
- Auth tokens
- Raw provider responses that may contain keys
- Environment variable values that are secrets
- Filesystem paths containing secrets in directory names

### Enforcement

Logging restrictions are enforced by convention and code review. The `[REDACTED]` masking in the config loader is the only automated enforcement.

---

## Plugin Sandbox Expectations

Plugins run in the same process as context-sieve. This means:

### What a Plugin CAN Do

```
✓ Read ctx.request (see what the client sent)
✓ Read ctx.metrics (see token counts)
✓ Write to ctx.state (share metadata)
✓ Use Node.js APIs (filesystem, network)
✓ Import npm packages
```

### What a Plugin SHOULD NOT Do

```
✗ Modify ctx.request.messages (changes provider input)
✗ Modify ctx.response (changes client output)
✗ Read/write snapshot files (violates immutability)
✗ Access SQLite directly (use AnnotationStore if needed)
✗ Call provider APIs (bypasses routing and security)
✗ Store credentials in plugin code or config
✗ Log API keys or secrets
```

### Why No Runtime Sandbox

context-sieve does not use:
- Separate processes (too slow for pipeline execution)
- WebAssembly (limited Node.js API access)
- vm2 or similar sandboxes (maintenance burden, false security)

Plugins are trusted by convention. Review plugin code before enabling it in production.

---

## Transport Security

### Outbound (Proxy to Provider)

All cloud provider communication uses HTTPS:

```typescript
const res = await fetch(`${baseUrl}/v1/chat/completions`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
})
```

- TLS encrypts the API key in transit.
- The API key is in an HTTP header, sent after TLS handshake.
- Local providers (Ollama, LM Studio) use HTTP on localhost — no TLS needed.

### Inbound (Client to Proxy)

The proxy listens on `http://localhost:3000` by default. For production use:

1. Place behind a reverse proxy (nginx, Caddy, Cloudflare Tunnel).
2. Enable TLS on the reverse proxy.
3. Add authentication at the reverse proxy level if needed.

context-sieve does not implement TLS natively. This is by design — TLS termination belongs at the infrastructure level.

---

## Attack Surface

| Vector | Exposure | Mitigation |
|--------|----------|------------|
| HTTP API (inbound) | Anyone who can reach port 3000 | Bind to localhost only; use reverse proxy for external access |
| Provider API (outbound) | Provider receives the request | Standard HTTPS; no additional data sent beyond the optimized request |
| Plugin system | Plugin code has full Node.js access | Code review before enabling; no auto-install from untrusted sources |
| Config files | YAML files on disk | File permissions (`chmod 600`); no secrets in committed files |
| Snapshot files | JSON on disk | File permissions; no secrets in snapshots |
| SQLite | Local file access | File permissions; single-process access |
| Logs | Terminal output | Avoid redirecting to shared locations; check for accidental secret exposure |

---

## Incident Response

### If a Secret Is Exposed

1. **Revoke the key** at the provider's dashboard immediately.
2. **Generate a new key.**
3. **Update the environment variable.**
4. **Restart context-sieve.**
5. **If committed to git**, rotate the key and remove it from history with `git filter-branch` or `bfg`.

### If a Snapshot Contains Sensitive Content

1. **Delete the snapshot file:** `rm data/snapshots/<id>.json`
2. **Delete associated replay artifacts:** `rm -rf data/replay/<id>/`
3. **Re-run the request** with the sensitive content excluded or redacted.

### If a Plugin Leaks Data

1. **Disable the plugin:** `context-sieve plugin disable <id>`
2. **Remove the plugin** from `plugins/manifest.json`.
3. **Delete any data** the plugin may have stored outside context-sieve's directories.
4. **Review the plugin code** for the leak source.
