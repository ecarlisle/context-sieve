# Logging Security

## What Gets Logged

The logging system outputs structured text to stdout/stderr:

| Category | Content | Level |
|---|---|---|
| Pipeline execution | Stage name, status, token counts, latency | info |
| Provider resolution | Provider ID, model name, routing decision | info |
| Errors | Error messages, stack traces (in verbose mode) | error |
| Configuration | Loaded config sources, plugin registration | info |
| Storage | Snapshot save confirmation, SQLite inserts | debug |

## What Is NOT Logged

| Content | Why Excluded |
|---|---|
| API keys | Never read from logs; read from env vars only |
| Full request messages | Only stage metadata is logged, not message content |
| Full response content | Only token counts and IDs are logged |
| Internal state dumps | No `console.log(ctx)` in production code |
| Plugin source code | Plugin modules are loaded, not logged |

## Secret Handling

Provider API keys are sourced from environment variables and interpolated into config at load time:

```
providers.yaml:  apiKey: "${OPENAI_API_KEY}"
                       ↓
Loader:          process.env["OPENAI_API_KEY"]
                       ↓
Memory:          config object (never written to logs)
```

**Rules:**
- API keys are never written to log output
- API keys are never written to snapshots
- API keys are never written to SQLite
- API keys are never persisted to disk (except in shell history — user responsibility)
- Config YAML files with `${VAR}` syntax are safe to commit to version control

## Verbose Mode

`--verbose` flag enables additional logging that may include:
- Stage metadata (summary IDs, prune counts)
- Analyzer decision details
- Provider response excerpts (token estimates only, never full content)

Verbose mode does NOT enable secret logging. If a provider adapter leaks an API key in an error message, that is a bug in the adapter.

## Best Practices

1. **Never put API keys in YAML files directly.** Always use `${VAR}` syntax with environment variables.
2. **Pipe logs to a file for debugging**, but verify no secrets are captured before sharing:
   ```bash
   context-sieve --verbose > debug.log 2>&1
   ```
3. **Use snapshot inspection instead of log grepping.** Snapshots contain structured data without the noise of stdout logging.
4. **Review verbose output for accidental key exposure** after modifying provider adapters.
