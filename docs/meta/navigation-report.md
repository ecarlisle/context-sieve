# Navigation Report

## Link Audit Results

**Method:** Verified all markdown links from README.md against filesystem. All 55 links resolve.

## Broken Links

**None found** in README.md after v2.1.2 fix.

## Orphan Documents

Documents with zero incoming links from README.md or other doc headers:

| Document | Incoming Links | Notes |
|---|---|---|
| `docs/testing/golden-replay-suites.md` | 0 | Sub-topic of golden-testing.md |
| `docs/testing/testing-strategy.md` | 0 | Superseded by testing/overview.md |
| `docs/providers/build-your-own-provider.md` | 0 | Advanced topic, no direct link |
| `docs/pruning-system.md` | 0 | Content covered by pipeline-invariants.md |
| `docs/summaries-and-memory.md` | 0 | Content covered by pipeline-invariants.md and data-model.md |
| `docs/how-to-use.md` | 0 | Superseded by guides/first-run.md |
| `docs/architecture.md` | 0 | Content covered by mental-model.md |

## Circular Navigation

- `docs/core/mental-model.md` → links to no other core docs (no problem)
- `docs/core/execution-guarantees.md` → links to `docs/core/pipeline-invariants.md` → links back (legitimate)
- `docs/contracts/` docs form a dense web of cross-references — all legitimate, no cycles

**No circular navigation detected.**

## Recommendations

| Document | Action |
|---|---|
| `docs/testing/golden-replay-suites.md` | Add link from testing/golden-testing.md |
| `docs/providers/build-your-own-provider.md` | Add link from providers/adapters.md |
| `docs/pruning-system.md` | Add redirect comment at top pointing to pipeline-invariants.md |
| `docs/summaries-and-memory.md` | Add redirect comment at top pointing to pipeline-invariants.md + data-model.md |
| `docs/how-to-use.md` | Add redirect comment at top pointing to guides/first-run.md |
| `docs/architecture.md` | Add redirect comment at top pointing to core/mental-model.md |
