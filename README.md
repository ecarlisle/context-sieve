# context-sieve

**Deterministic context transformation proxy · execution observability platform · replayable AI context debugger**

context-sieve sits between AI coding agents (OpenCode) and inference providers. It intercepts chat completion requests, applies a fixed pipeline of context transformations (collect → measure → budget → summarize → prune → dedupe → compress → retrieve → forward), dispatches the optimized request to a provider (via deterministic routing), and records every decision for replay, audit, and analysis.

It is not an agent framework, prompt optimizer, or semantic reasoning engine.

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client (OpenCode)                        │
│                    POST /v1/chat/completions                     │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Execution Layer                                                 │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐        │
│  │collect│→│measure│→│budget│→│summ. │→│prune │→│dedupe│→ ...  │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘        │
│  → compress → retrieve → forward → response                     │
└───────────┬─────────────────────────────────────┬───────────────┘
            │                                     │
            ▼                                     ▼
┌──────────────────────┐              ┌──────────────────────────┐
│  Observation Layer    │              │  Inference Layer          │
│  RunSnapshot (JSON)   │              │  ProviderRegistry →       │
│  Metrics (in-memory)  │              │  Adapter → Provider API   │
│  Logs (stdout)        │              └──────────────────────────┘
└───────────┬──────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Replay Layer                                                    │
│  Snapshot → TimelineFrame[] — pure projection, no re-execution   │
└───────────┬─────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Analysis Layer                                                  │
│  Diff · Benchmark · Regression · Search — all read-only          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Start Here

New to the system? Follow this path in order:

1. **[Mental Model](docs/core/mental-model.md)** — what the system is and how it thinks
2. **[Execution Guarantees](docs/core/execution-guarantees.md)** — what you can trust
3. **[What It Is Not](docs/core/what-it-is-not.md)** — anti-misconceptions
4. **[Replay vs Execution](docs/replay/replay-vs-execution.md)** — the single most important distinction
5. **[Provider Overview](docs/providers/overview.md)** — how providers work
6. **[First Run](docs/guides/first-run.md)** — send your first request
7. **[Provider Setup](docs/guides/provider-setup.md)** — configure real providers

### Learning Paths

| Role | Path |
|---|---|
| **Operator** | Start Here → Provider Setup → Observability → Debugging |
| **Plugin Author** | Start Here → Extension Model → Plugin Guide → SDK Reference |
| **Contributor** | Start Here → Architecture → Testing → Contracts |
| **Evaluator** | Start Here → Multi-Run → Benchmark → Regression |

---

## Quick Start

```bash
pnpm install
pnpm dev
```

```bash
# Validate setup
curl http://localhost:3000/health

# Send a request
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Hello"}]}'

# Inspect the result
npx tsx src/index.ts inspect <runId>
```

---

## Provider System

context-sieve routes each request to a provider through a deterministic resolution chain:

```
1. Explicit override   — { provider: "openai" } in the request body
2. Model-based routing — micromatch pattern rules (gpt-* → openai, claude-* → anthropic)
3. Default fallback    — provider configured in config/providers.yaml
```

### Built-in providers

| Provider | Adapter | Configuration |
|---|---|---|
| OpenAI | `openai.ts` | `apiKey: ${OPENAI_API_KEY}` |
| Anthropic | `anthropic.ts` | `apiKey: ${ANTHROPIC_API_KEY}` |
| OpenRouter | `openrouter.ts` | `apiKey: ${OPENROUTER_API_KEY}` |
| Ollama | `ollama.ts` | `baseUrl: http://localhost:11434` |
| LM Studio | `lmstudio.ts` | `baseUrl: http://localhost:1234` |
| OpenCode Zen | `opencodezen.ts` | `apiKey: ${OPENCODE_ZEN_API_KEY}` |

All providers conform to the same normalized `InferenceProvider` interface. The pipeline is provider-agnostic — providers are interchangeable execution backends.

### Validation CLI

```bash
context-sieve providers validate          # Validate all providers
context-sieve providers validate openai   # Validate a specific provider
context-sieve providers list              # List providers with config status
context-sieve providers resolve gpt-4o    # Show routing for a model
```

### Response metadata

Every response includes the resolved `provider`:
```json
{
  "provider": "openai",
  "content": "...",
  "pipelineTrace": [...]
}
```

Metrics track provider distribution:
```json
GET /metrics → { "providerDistribution": { "mock": 5 }, "providerErrorCount": 0, "averageProviderLatencyMs": 42 }
```

---

## Documentation Map

```
docs/
├── core/               # Mental model, guarantees, invariants
├── contracts/          # Truth hierarchy, failure semantics, consistency
├── providers/          # Architecture, routing, configuration, adapters
├── replay/             # Replay semantics, timeline model, guarantees
├── observability/      # Metrics, traces, run analysis
├── extensions/         # Plugin model, lifecycle, boundaries
├── plugins/            # Plugin development guide + runtime model
├── sdk/                # Plugin SDK reference
├── testing/            # Strategy, golden tests, snapshot tests
├── debugging/          # Workflows, failure modes, investigation guide
├── security/           # Trust boundaries, security model, logging
├── data/               # Data model, storage schema
├── multirun/           # Multi-provider execution comparison
├── guides/             # First run, provider setup, golden tests
├── releases/           # Release notes
└── architecture.md     # System architecture overview
```

### Core

| Document | What It Explains |
|---|---|
| [Mental Model](docs/core/mental-model.md) | Four layers: execution, observation, replay, analysis |
| [Execution Guarantees](docs/core/execution-guarantees.md) | Invariants: immutability, determinism, stage ordering |
| [What It Is Not](docs/core/what-it-is-not.md) | Anti-misconceptions |
| [Pipeline Invariants](docs/core/pipeline-invariants.md) | Stage ordering rules, noop semantics, forbidden operations |

### Contracts

| Document | What It Explains |
|---|---|
| [Truth Hierarchy](docs/contracts/truth-hierarchy.md) | Precedence: snapshot → trace → replay → metrics → logs |
| [Failure Semantics](docs/contracts/failure-semantics.md) | System behavior under every failure mode |
| [Versioning Model](docs/contracts/versioning-model.md) | Schema evolution and compatibility |
| [Cross-Layer Consistency](docs/contracts/cross-layer-consistency.md) | Disagreement resolution between layers |

### Providers

| Document | What It Explains |
|---|---|
| [Overview](docs/providers/overview.md) | What providers are and how routing works |
| [Architecture](docs/providers/architecture.md) | Three-layer provider design |
| [Selection](docs/providers/selection.md) | Resolution chain: override → rules → default |
| [Configuration](docs/providers/provider-configuration.md) | YAML config files with env interpolation |
| [Adapters](docs/providers/provider-adapters.md) | Interface, built-in adapters, normalization |
| [Routing](docs/providers/provider-routing.md) | Micromatch pattern matching |
| [Validation](docs/providers/provider-validation.md) | CLI commands and failure reference |
| [Debugging](docs/providers/provider-debugging.md) | Verbose mode, common failures |
| [Security](docs/providers/provider-security.md) | Secret handling, transport isolation |

### Replay

| Document | What It Explains |
|---|---|
| [Replay vs Execution](docs/replay/replay-vs-execution.md) | Why replay is projection, not re-execution |
| [Replay Guarantees](docs/replay/replay-guarantees.md) | Deterministic structure, frame integrity, offline operation |
| [Timeline Model](docs/replay/timeline-model.md) | Frame structure, derivation, determinism |

### Observability

| Document | What It Explains |
|---|---|
| [Observability Design](docs/observability/observability-design.md) | What is observed vs what is not |
| [Metrics](docs/observability/metrics.md) | Exposed metrics, GET /metrics, heuristic vs deterministic |
| [Trace Model](docs/observability/trace-model.md) | StageResult structure, metadata patterns |
| [Run Analysis](docs/observability/run-analysis.md) | Diff, benchmark, regression, search |

### Testing

| Document | What It Explains |
|---|---|
| [Overview](docs/testing/overview.md) | Four-layer testing strategy |
| [Unit Testing](docs/testing/unit-testing.md) | Mechanical correctness |
| [Golden Testing](docs/testing/golden-testing.md) | Behavioral consistency via fixture-based replay |
| [Snapshot Testing](docs/testing/snapshot-testing.md) | Immutability, round-trip validation |
| [Testing Philosophy](docs/testing/testing-philosophy.md) | What we test and why |

### Debugging

| Document | What It Explains |
|---|---|
| [Failure Modes](docs/debugging/failure-modes.md) | Common failures and their symptoms |
| [Debugging Workflows](docs/debugging/debugging-workflows.md) | Step-by-step debugging |
| [Investigation Guide](docs/debugging/investigation-guide.md) | Full failure investigation workflow |

### Extensions

| Document | What It Explains |
|---|---|
| [Extension Model](docs/extensions/extension-model.md) | Plugin lifecycle, allowed vs forbidden |
| [Plugin Lifecycle](docs/extensions/plugin-lifecycle.md) | Load → register → enable → execute → disable |
| [Boundaries](docs/extensions/boundaries.md) | What plugins may and may not do |

### Security

| Document | What It Explains |
|---|---|
| [Trust Boundaries](docs/security/trust-boundaries.md) | Who can mutate what |
| [Security Model](docs/security/security-model.md) | Secrets, isolation |
| [Logging](docs/security/logging.md) | What gets logged, secret handling |

### Data Model

| Document | What It Explains |
|---|---|
| [Entities](docs/data/data-model.md) | RunSnapshot, TimelineFrame, Annotation, reports |
| [Storage Schema](docs/data/storage-schema.md) | SQLite tables, filesystem layout |

### Guides

| Document | What It Explains |
|---|---|
| [First Run](docs/guides/first-run.md) | Send your first request through the system |
| [Provider Setup](docs/guides/provider-setup.md) | Configure real inference providers |
| [Golden Test Guide](docs/guides/run-golden-tests.md) | Run and maintain golden tests |

### Multi-Run

| Document | What It Explains |
|---|---|
| [Overview](docs/multirun/overview.md) | What multi-provider execution is |
| [Architecture](docs/multirun/architecture.md) | Components and data flow |
| [Comparison Model](docs/multirun/comparison-model.md) | Divergence interpretation |
| [Divergence Metrics](docs/multirun/divergence-metrics.md) | Token/latency/divergence details |
| [CLI Guide](docs/multirun/cli-guide.md) | multirun run/compare commands |

### CLI Reference

```bash
context-sieve providers list             # Show configured providers
context-sieve providers test <id>        # Test a provider connection
context-sieve providers validate [id]    # Validate provider connectivity
context-sieve providers resolve <model>  # Show routing for a model
context-sieve inspect <runId>            # Inspect a run snapshot
context-sieve debug <runId>              # Interactive timeline debugger
context-sieve diff <idA> <idB>          # Compare two snapshots
context-sieve search --text "..."        # Search run metadata
context-sieve annotate <runId> <index>   # Add an annotation
context-sieve regression --baseline ...  # Detect regression
context-sieve benchmark --compare ...    # Benchmark runs
context-sieve plugin create <name>       # Scaffold a plugin
context-sieve multirun run               # Execute across providers
context-sieve multirun compare           # Compare multi-provider runs
context-sieve test                       # Run full test suite
context-sieve test golden                # Run golden replay tests
context-sieve test coverage              # Run tests with coverage
```

---

## Documentation Governance

The documentation under `docs/` is maintained as a subsystem with its own quality standards.

| Principle | Rule |
|---|---|
| **Version headers** | Every doc has Introduced/Updated/Applies To metadata (see [Version Index](docs/meta/version-index.md)) |
| **No duplication** | Cross-link between docs instead of repeating content (see [Duplication Report](docs/meta/duplication-report.md)) |
| **Consistency** | Terminology and invariants are synchronized across all docs (see [Consistency Report](docs/meta/consistency-report.md)) |
| **Navigation** | Every doc has at least one incoming link from a parent doc (see [Navigation Report](docs/meta/navigation-report.md)) |
| **Style** | Follow [Documentation Style Guide](docs/meta/documentation-style-guide.md) |
| **Ownership** | Each doc area has a designated owner (see [Ownership](docs/meta/ownership.md)) |
| **Terminology** | Use terms from [Terminology Reference](docs/meta/terminology.md) |
| **Release process** | Doc changes follow [Release Process](docs/meta/release-process.md) |

See [Reconciliation Checklist](docs/meta/reconciliation-checklist.md) for the full audit process used to maintain document quality.

---

## License

MIT
