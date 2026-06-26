# Testing Overview

context-sieve uses a four-layer testing strategy:

| Layer | Tool | What It Verifies |
|-------|------|-----------------|
| Unit | Vitest | Mechanical correctness of individual components |
| Golden | Vitest + Fixtures | Behavioral consistency across pipeline runs |
| Replay | Snapshot comparison | Historical trust — can past runs be replayed faithfully |
| Multirun | Comparison engine | Provider divergence is structural, not semantic |

## Running Tests

```bash
pnpm test              # Run all tests
pnpm test:watch        # Watch mode
pnpm test:coverage     # Run with coverage report
pnpm test:unit         # Unit tests only
pnpm test:golden       # Golden replay tests only
pnpm test:integration  # Integration tests only
```

## Coverage Thresholds

| Component | Threshold |
|-----------|-----------|
| Pipeline | 95% |
| Analyzer | 90% |
| Providers (registry, mock) | 90% |
| Snapshots (types, store) | 95% |

The build fails if coverage drops below these thresholds.

## What Each Layer Protects

- **Unit tests**: "Did execution work?" — individual functions do what they claim
- **Golden tests**: "Did behavior change?" — the pipeline produces consistent output for known inputs
- **Replay validation**: "Can history be trusted?" — snapshots round-trip, traces are complete
- **Multirun comparison**: "Is divergence structural?" — provider differences are measured mechanically, not judged semantically
