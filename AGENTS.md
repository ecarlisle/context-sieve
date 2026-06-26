# AGENTS.md

**Context-Sieve — deterministic context transformation and observability proxy.**

A TypeScript-based proxy between OpenCode and upstream inference providers. Reduces token usage while preserving semantic fidelity of requests and responses. Not a chatbot system but a context transformation pipeline.

---

## Current status

Implemented with 60+ tests, provider routing, snapshot/replay, golden testing, CLI, and HTTP server. Full documentation suite. See CHANGELOG.md for version history.

---

## Pipeline architecture (fixed order)

```
collect → measure → budget → summarize → prune → dedupe → compress → retrieve → forward
```

- Order is fixed, must not be rearranged dynamically
- Each stage may be disabled via configuration
- Each stage must emit metrics
- Stages must be pure or explicitly side-effecting (no hidden state)

---

## Non-negotiable invariants

- User intent must never be altered or inferred beyond explicit content
- Constraints must never be removed or weakened
- Missing information must not be hallucinated or reconstructed
- All transformations must be traceable
- Streaming must not be blocked or fully buffered
- Lossy operations must be explicit and logged
- If a rule conflicts with optimization: correctness wins

---

## Compression philosophy

- Prefer removal of redundancy over summarization
- Prefer summarization over reconstruction
- Never invent missing context
- Preserve structure over verbosity
- If uncertain, preserve content and downgrade importance instead of deleting

---

## Storage and observability

- Storage should be append-only; summaries should link back to original content
- SQLite is planned for: summaries, metrics, request traces
- Every request must record: original token estimate, final forwarded count, compression ratio, stage timings, applied transformations
- System must support replay, stage toggling, and semantic drift measurement

---

## Code design constraints (for implementation phase)

- Prefer pure functions in compression logic
- Provider adapters must be isolated and swappable
- Maintain strict separation between: transport layer / transformation layer / storage layer
