# Release Process

## Documentation-Release Workflow

Every release must go through:

```
Feature → Code → Docs → Audit → Release
```

### 1. Feature

Feature is specified, scoped, and approved.

### 2. Code

Feature is implemented and tested. All tests pass.

### 3. Docs

Documentation is created or updated:
- New features get new docs in the appropriate area
- Changed behavior updates existing docs
- Deprecated features get notices in CHANGELOG
- Version headers (`Introduced`, `Updated`, `Applies To`) are set
- README is updated if the doc map changes

### 4. Audit

Documentation audit:
1. Cross-link verification (no broken links)
2. Terminology check (no drift from `docs/meta/terminology.md`)
3. Consistency check (no contradictions with existing docs)
4. Duplicate check (no >50% overlap with existing docs)
5. Architecture alignment (all layers described consistently)

### 5. Release

1. Create `docs/releases/v{version}.md`
2. Update `CHANGELOG.md`
3. Tag the release
4. Verify all CI checks pass

## Documentation Gate

**A feature is not complete until its documentation is audited.**

The audit step must produce no unresolved items before the release proceeds.

## Versioning

- **Major (v1, v2):** Breaking changes. Snapshots may be incompatible. Docs rewritten.
- **Minor (v2.1, v2.2):** New features. Documentation added. Migration notes required.
- **Patch (v2.1.1, v2.1.2):** Bug fixes or doc-only changes. No migration needed.

## Release Notes Structure

Each `docs/releases/v{version}.md` must contain:

1. Version number and date
2. What changed (summary)
3. Why (rationale)
4. Migration notes (if applicable)
5. Examples (if applicable)
6. Verification (test results, typecheck status)
