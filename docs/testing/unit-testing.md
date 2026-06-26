# Unit Testing

Unit tests validate mechanical correctness — they answer "did execution work?"

## Scope

| Test File | What It Tests |
|-----------|---------------|
| `tests/unit/pipeline.test.ts` | Stage ordering, execution count, noop semantics, error handling, trace completeness |
| `tests/unit/analyzer.test.ts` | Determinism, confidence stability, ctx immutability, per-stage behavior |
| `tests/unit/providers.test.ts` | Provider resolution, override precedence, routing, unknown handling |
| `tests/unit/snapshots.test.ts` | Required fields, serialization round-trip, immutability, optional fields |
| `tests/unit/plugins.test.ts` | Plugin contract constraints (type-level validation) |

## Principles

1. **No network calls** — all providers are mocked
2. **No filesystem** — tests use in-memory storage where possible
3. **Deterministic assertions** — never assert on random or timing-dependent values
4. **Isolated state** — each test creates fresh context

## Writing Unit Tests

```typescript
import { describe, it, expect } from 'vitest'
import { analyzeStage } from '../../src/pipeline/analyzer.js'
import { createContext } from '../helpers/index.js'

it('returns correct confidence', () => {
  const ctx = createContext([{ role: 'user', content: 'Hello' }])
  const decision = analyzeStage('collect', ctx.request, ctx)
  expect(decision.confidence).toBe(1.0)
})
```
