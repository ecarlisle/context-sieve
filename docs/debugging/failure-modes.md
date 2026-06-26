# Failure Modes

## Overview

This document catalogs known failure modes across the system. Each entry describes the symptom, root cause, observable evidence, and resolution.

---

## Provider Failures

### 1. No Provider Resolved

**Symptom:** Request returns `500 Internal Server Error` with message `No provider resolved for model "gpt-4o"`.

**Trace evidence:**
```json
{"stage": "forward", "status": "error", "meta": {"error": "No provider resolved for model \"gpt-4o\""}}
```

**Root causes:**
- Model name doesn't match any routing rule.
- Routing rule points to a provider that isn't configured.
- No default provider is set in `providers.yaml`.

**Resolution:**
```bash
# Check configured providers
context-sieve providers list

# Test routing
context-sieve providers resolve gpt-4o

# Check config files exist
ls config/providers.yaml config/routing.yaml
```

### 2. Provider Returns 401 / 403

**Symptom:** Request fails with `HTTP 401: Unauthorized` or `HTTP 403: Forbidden`.

**Trace evidence:**
```json
{"stage": "forward", "status": "error", "meta": {"error": "HTTP 401: Unauthorized"}}
```

**Root causes:**
- API key is missing or incorrect.
- Environment variable not set.
- API key was revoked.

**Resolution:**
```bash
# Test the provider directly
context-sieve providers test openrouter

# Check if env var resolves
echo ${#OPENROUTER_API_KEY}
```

### 3. Provider Returns 429 (Rate Limited)

**Symptom:** Intermittent failures, especially during burst requests.

**Trace evidence:**
```json
{"stage": "forward", "status": "error", "meta": {"error": "HTTP 429: Too Many Requests"}}
```

**Root causes:**
- Free-tier rate limit exceeded.
- Burst of requests from multiple clients.

**Resolution:**
- Wait and retry.
- Add credits to your provider account.
- Configure multiple providers with different rate limits.

### 4. Provider Unreachable

**Symptom:** Request hangs or fails with connection error.

**Trace evidence:**
```json
{"stage": "forward", "status": "error", "meta": {"error": "fetch failed: connect ECONNREFUSED localhost:11434"}}
```

**Root causes:**
- Local provider (Ollama, LM Studio) not running.
- Wrong `baseUrl` in config.
- Network outage.

**Resolution:**
```bash
# Test the provider directly
curl http://localhost:11434/api/tags

# Check baseUrl in config
grep baseUrl config/providers.yaml
```

---

## Pipeline Failures

### 5. Missing Stage in Trace

**Symptom:** The pipeline trace has fewer stages than expected.

**Snapshot evidence:**
```json
{"pipelineTrace": [{"stage": "collect"}, {"stage": "measure"}, {"stage": "forward"}]}
```

**Root cause:** The pipeline was constructed with a subset of stages.

**Resolution:** Check pipeline construction in `src/index.ts`. Every stage should be included in the array.

### 6. Stage Returns Unexpected Status

**Symptom:** A stage returns `status: 'skipped'` when you expected it to run.

**Trace evidence:**
```json
{"stage": "summarize", "status": "skipped", "meta": {"reason": "disabled by config"}}
```

**Root cause:** The stage's configuration check returned false. For example, `summarize` skips if `enableSummarization` is false.

**Resolution:** Check stage configuration in `defaultConfig()`.

### 7. Stage Returns Error

**Symptom:** A stage fails during execution.

**Trace evidence:**
```json
{"stage": "prune", "status": "error", "meta": {"error": "Cannot read property 'map' of undefined"}}
```

**Root cause:** A stage encountered unexpected input (missing message field, malformed state data).

**Resolution:** Check the pipeline state before the failing stage. Stages may depend on specific state keys set by earlier stages.

---

## Replay Failures

### 8. Snapshot Not Found

**Symptom:** `context-sieve inspect <id>` returns "Snapshot not found."

**Root cause:** The snapshot ID doesn't exist in the store.

**Resolution:**
```bash
# List recent snapshots
ls data/snapshots/

# Check the correct data directory
echo $CONTEXT_SIEVE_DATA_DIR
```

### 9. Corrupted Snapshot

**Symptom:** Replay fails with JSON parse error.

**Evidence:**
```
Error: Unexpected token in JSON at position 1234
```

**Root cause:** The snapshot file was manually edited, truncated by a crash, or corrupted by disk error.

**Resolution:** The snapshot is unrecoverable. Re-run the request or use a backup.

### 10. Inconsistent Replay Artifacts

**Symptom:** Replay frames don't match snapshot content.

**Root cause:** The replay artifact was generated from an older version of the snapshot, or the snapshot was modified after replay artifact creation.

**Resolution:** Delete the replay artifact directory (`data/replay/<runId>/`) and regenerate it from the snapshot.

---

## Plugin Failures

### 11. Plugin Not Found in Manifest

**Symptom:** `context-sieve plugin enable <id>` fails.

**Evidence:**
```
Failed to enable plugin: Plugin not found in manifest: my-plugin
```

**Root cause:** The plugin ID is not in `plugins/manifest.json`.

**Resolution:**
```bash
# List registered plugins
context-sieve plugin list

# Check manifest file
cat plugins/manifest.json
```

### 12. Plugin Stage Duplicate Name

**Symptom:** Plugin registration fails.

**Evidence:**
```
Error: Stage "my-stage" already registered
```

**Root cause:** Two plugins define a stage with the same name, or the built-in stage has the same name.

**Resolution:** Rename one of the stages. Stage names must be unique across all built-in and plugin stages.

### 13. Plugin Stage Unknown Position

**Symptom:** Plugin registration fails.

**Evidence:**
```
Error: Unknown relativeTo stage: "nonexistent"
```

**Root cause:** The plugin's stage `relativeTo` references a stage that doesn't exist.

**Resolution:** Check built-in stage names: collect, measure, budget, summarize, prune, dedupe, compress, retrieve, forward.

---

## Storage Failures

### 14. SQLite Database Locked

**Symptom:** Request succeeds but annotations or request traces fail to save.

**Log evidence:**
```
Error: SQLITE_BUSY: database is locked
```

**Root cause:** Multiple processes accessing the same database file.

**Resolution:** Only one context-sieve instance may run at a time. Check for other processes: `ps aux | grep context-sieve`.

### 15. Disk Full

**Symptom:** Snapshots fail to save.

**Log evidence:**
```
Error: ENOSPC: no space left on device, write
```

**Root cause:** The `data/` directory is on a full disk.

**Resolution:** Free disk space or configure a different `data/` location.

---

## Configuration Failures

### 16. Invalid YAML

**Symptom:** Server fails to start.

**Log evidence:**
```
Error: Invalid YAML in config/providers.yaml: mapping values are not allowed here
```

**Root cause:** Malformed YAML (wrong indentation, missing colons, unclosed strings).

**Resolution:** Validate YAML files:
```bash
npx yamlint config/providers.yaml
```

### 17. Environment Variable Not Set

**Symptom:** Provider authentication fails.

**Log evidence:**
```
[config] openai baseUrl=https://api.openai.com apiKey=
```

If the `apiKey=` value is empty (no `[REDACTED]`), the environment variable was not set.

**Resolution:**
```bash
export OPENAI_API_KEY=sk-proj-xxxxxxxx
```

---

## Failure Mode Quick Reference

| # | Symptom | Likely Cause | First Check |
|---|---------|-------------|-------------|
| 1 | `No provider resolved` | Missing routing or default | `context-sieve providers list` |
| 2 | `HTTP 401` | Bad API key | `context-sieve providers test` |
| 3 | `HTTP 429` | Rate limited | Wait and retry |
| 4 | `ECONNREFUSED` | Provider not running | Check provider service |
| 5 | Missing stages | Wrong pipeline construction | Check `src/index.ts` |
| 6 | Stage skipped unexpectedly | Config disabled | Check `defaultConfig()` |
| 7 | Stage error | Unexpected input | Check pipeline state |
| 8 | Snapshot not found | Wrong ID or missing file | `ls data/snapshots/` |
| 9 | JSON parse error | Corrupted snapshot | Re-run request |
| 10 | Inconsistent replay | Artifact/snapshot mismatch | Regenerate replay |
| 11 | Plugin not found | Not in manifest | `context-sieve plugin list` |
| 12 | Duplicate stage name | Plugin name collision | Check stage names |
| 13 | Unknown position | Wrong `relativeTo` | Check built-in stage names |
| 14 | Database locked | Multiple instances | `ps aux | grep context-sieve` |
| 15 | Disk full | Out of space | `df -h` |
| 16 | Invalid YAML | Malformed config | `npx yamlint` |
| 17 | Empty API key | Env var not set | `echo $KEY_NAME` |
