# Changelog

## v2.1.2 — 2025-06-25

Documentation completion pass. No runtime changes.

### Added
- Provider selection documentation (`docs/providers/selection.md`)
- Timeline model documentation (`docs/replay/timeline-model.md`)
- Metrics reference (`docs/observability/metrics.md`)
- Trace model documentation (`docs/observability/trace-model.md`)
- Run analysis documentation (`docs/observability/run-analysis.md`)
- Extension boundaries documentation (`docs/extensions/boundaries.md`)
- Logging security documentation (`docs/security/logging.md`)
- Investigation guide (`docs/debugging/investigation-guide.md`)
- First run guide (`docs/guides/first-run.md`)
- Provider setup guide (`docs/guides/provider-setup.md`)
- Golden test guide (`docs/guides/run-golden-tests.md`)
- Release notes (`docs/releases/v2.1.2.md`)

### Changed
- README.md updated to System Entry Index with architecture diagram, learning paths, and complete documentation map
- README.txt updated to redirect to README.md

### Fixed
- No code changes in this release

---

## v2.1.1 — 2025-06-25

Provider validation layer.

### Added
- `validate()` method on `InferenceProvider` interface (required)
- `validate()` implementation on MockProvider and all 5 adapter factories
- `validateProvider(id)` and `validateAll()` methods on `ProviderRegistry`
- `providers validate` CLI command (single and batch mode)
- Shared `validateConnectivity()` helper in adapters

### Changed
- `InferenceProvider.validate()` is now a required member (was optional in earlier drafts)

### Fixed
- No behavioral changes to existing pipeline execution
- All 60 tests pass, `tsc --noEmit` clean

---

## v2.1.0 — 2025-06-20

Test infrastructure and documentation.

### Added
- Vitest configuration with Istanbul coverage
- 5 unit test files (56 tests): pipeline, analyzer, providers, snapshots, plugins
- 3 golden replay fixtures (trivial, medium, heavy)
- HTTP integration tests (7 tests)
- Snapshot testing helpers
- Test CLI commands (`context-sieve test`)
- UI Testing tab in web dashboard
- Full testing documentation suite

---

## v2.0.0 — 2025-06-15

Initial public release. Pipeline execution, provider routing, snapshot capture, replay debugging, multi-run comparison, plugin system.
