# Provider Configuration

## Configuration Files

Provider configuration lives in two YAML files under the `config/` directory:

```
config/
├── providers.yaml     # Provider credentials and default
└── routing.yaml       # Model-to-provider routing rules
```

Both files are loaded at startup by `ProviderRegistry`. If a file is missing, defaults are used (MockProvider, no routing rules).

## providers.yaml

```yaml
default: openrouter

providers:
  openai:
    baseUrl: https://api.openai.com
    apiKey: ${OPENAI_API_KEY}
    defaultModel: gpt-4o

  anthropic:
    apiKey: ${ANTHROPIC_API_KEY}
    defaultModel: claude-3.5-sonnet

  openrouter:
    baseUrl: https://openrouter.ai/api
    apiKey: ${OPENROUTER_API_KEY}

  ollama:
    baseUrl: http://localhost:11434

  lmstudio:
    baseUrl: http://localhost:1234
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `default` | Yes | Provider ID to use when no routing rule matches and no override is set |
| `providers` | Yes | Map of provider ID to configuration |
| `.baseUrl` | No | Base URL for the provider API. Defaults to the provider's standard URL. |
| `.apiKey` | No | API key for authentication. Can use `${ENV_VAR}` interpolation. |
| `.defaultModel` | No | Default model to use if none is specified in the request. |

### Supported Provider IDs

| ID | Standard Base URL | Auth Required |
|----|-------------------|---------------|
| `mock` | — | No |
| `openai` | `https://api.openai.com` | Yes |
| `anthropic` | `https://api.anthropic.com` | Yes |
| `openrouter` | `https://openrouter.ai/api` | Yes |
| `ollama` | `http://localhost:11434` | No |
| `lmstudio` | `http://localhost:1234` | No |

### Minimal Config

```yaml
default: mock
providers: {}
```

This config uses MockProvider for everything. No external API calls are made.

### Local-Only Config

```yaml
default: ollama
providers:
  ollama: {}
```

All requests go to Ollama at `http://localhost:11434`.

## Environment Variable Interpolation

Values containing `${VARIABLE_NAME}` are replaced with the value of the corresponding environment variable at load time.

```yaml
# config/providers.yaml
providers:
  openai:
    apiKey: ${OPENAI_API_KEY}
```

**How it works:**

1. context-sieve reads `providers.yaml`.
2. The config loader scans every string value for `${...}` patterns.
3. Each pattern is replaced with `process.env[VARIABLE_NAME]`.
4. If the environment variable is not set, the pattern is replaced with an empty string.

**Best practices:**

- Always use environment variables for secrets. Never hardcode API keys in YAML files.
- Set variables in your shell profile, `.env` file, or CI secrets manager.
- Use verbose mode to verify that variables are resolved: the config loader logs `[REDACTED]` instead of the actual value.

## Secret Handling

**context-sieve never logs raw secrets.**

When provider configuration is read, the config loader masks `apiKey` values in:
- Console output (verbose mode)
- Log files
- Error messages
- API responses

**Example verbose log:**

```
[config] loaded providers: openai, anthropic, openrouter
[config] openai baseUrl=https://api.openai.com apiKey=[REDACTED]
```

If you see the literal string `${OPENAI_API_KEY}` in a log message, the environment variable was not set. Check your environment.

## routing.yaml

```yaml
routing:
  "gpt-*": openai
  "claude-*": anthropic
  "o1-*": openai
  "llama-*": ollama
  "mistral-*": openrouter
  "*": openrouter
```

See [Provider Routing](./provider-routing.md) for detailed documentation on how routing rules work.

### Multiple Providers for the Same Model Group

You can route different model prefixes to different providers:

```yaml
routing:
  "gpt-4o": openai
  "gpt-4o-mini": openrouter
```

**Note:** Order matters. More specific patterns should come first.

## File Locations

By default, config files are loaded from:

```
/path/to/project/config/providers.yaml
/path/to/project/config/routing.yaml
```

You can override paths programmatically by passing custom paths to `loadProvidersConfig()` and `loadRoutingConfig()`.

## Validating Configuration

```bash
# List all configured providers
context-sieve providers list

# Output:
# Providers (4):
#   openai [configured] routes=3
#   anthropic [configured] routes=1
#   openrouter [configured] routes=0
#   ollama [configured] routes=1
#
# Default provider: openrouter
#
# Routing rules (4):
#   gpt-* -> openai
#   claude-* -> anthropic
#   llama-* -> ollama
#   * -> openrouter
```

If a provider shows as `unconfigured`, check that its ID is correct and its entry in `providers.yaml` is valid YAML.

## Common Mistakes

**Missing colon in YAML:**

```yaml
providers
  openai:
```

YAML requires a colon after every key.

**Wrong indentation:**

```yaml
providers:
openai:
```

`providers:` must be followed by indented children. Use 2 spaces.

**Unclosed string:**

```yaml
apiKey: ${OPENAI_API_KEY
```

Missing closing `}`. The config loader will leave this as a literal string.

**Missing default:**

```yaml
providers:
  openai:
    apiKey: ${OPENAI_API_KEY}
```

If `default` is missing, the system falls back to `"mock"`. All real requests fail silently.
