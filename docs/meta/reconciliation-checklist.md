# Reconciliation Checklist

Use this checklist to audit documentation consistency.

## Pre-Audit

- [ ] All docs read (core, contracts, providers, replay, observability, testing, debugging, extensions, security, data)
- [ ] README.md read
- [ ] CHANGELOG.md read
- [ ] AGENTS.md read

## Terminology

- [ ] No deprecated terms used (see `terminology.md`)
- [ ] "execution" vs "run" consistent
- [ ] "snapshot" vs "record" consistent
- [ ] Stage result states consistent (ok/noop/skipped/error)
- [ ] No synonyms for the same concept

## Links

- [ ] Every README link resolves to an existing file
- [ ] Every doc cross-link resolves
- [ ] No orphan documents (zero incoming links)
- [ ] No circular navigation paths

## Duplicates

- [ ] No concept explained in >2 places without cross-reference
- [ ] "What it is not" content unified or cross-linked
- [ ] Noop semantics explained once, referenced elsewhere
- [ ] Stage ordering explained once, referenced elsewhere

## Architecture

- [ ] README architecture diagram matches mental-model.md
- [ ] Core docs agree on stage count (9)
- [ ] Core docs agree on stage order
- [ ] Contracts agree with core docs
- [ ] Provider docs agree with contracts

## Version Headers

- [ ] Every doc has `Introduced` metadata
- [ ] Every doc has `Updated` metadata (or N/A)
- [ ] Every doc has `Applies To` metadata

## Stale Content

- [ ] AGENTS.md reflects current state (not "design-only")
- [ ] No "56 tests" references (now 60)
- [ ] No "mock-only" references if real providers exist
- [ ] CLI help screens match docs

## Release Documentation

- [ ] CHANGELOG.md has current release
- [ ] Release notes exist in docs/releases/
- [ ] Release notes link to changed docs

## Post-Audit

- [ ] Issues documented in consistency-report.md
- [ ] Fixes applied
- [ ] Re-audit after fixes
