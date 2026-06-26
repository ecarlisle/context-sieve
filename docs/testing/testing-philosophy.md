# Testing Philosophy

## Why Test Like This?

The system is a deterministic context transformation proxy. It does not generate text, make predictions, or evaluate quality. Testing must match this:

### 1. Validate Mechanics, Not Intelligence

We test that the pipeline runs stages in order, that decisions are deterministic, and that snapshots are immutable. We do not test that summaries are "good" or that pruning chose the "right" messages.

### 2. Structural Comparison Only

Every comparison — between snapshots, between providers, between golden and actual — uses structural metrics: token counts, stage order, field presence. Never semantic similarity, never LLM-as-judge.

### 3. Deterministic by Default

All analysis functions must produce the same output for the same input. Timing, randomness, and external state are isolated to the provider layer (which is mocked in tests).

### 4. Traceability Over Coverage

100% line coverage is not the goal. The goal is that every invariant in the system truth contracts (`docs/contracts/`) has at least one test that would fail if the invariant were broken.

## What Not To Test

- Semantic quality of summaries or responses
- Provider API compatibility (tested separately via CLI)
- UI rendering (tested in browser manually)
- Third-party library behavior

## Layer Responsibilities

| Layer | Owns | Tests |
|-------|------|-------|
| Pipeline | Stage orchestration | Order, count, error handling |
| Analyzer | Stage decisions | Determinism, confidence, eligibility |
| Providers | Model resolution | Routing, override, fallback |
| Snapshots | Run persistence | Immutability, round-trip, structure |
| HTTP Server | Request handling | Status codes, response shape, trace attachment |
