# Context-Sieve Architecture

> **Note:** This document has been superseded by the [Mental Model](../docs/core/mental-model.md) document which contains the up-to-date architectural overview. This file is retained for reference.

## Overview

Context-Sieve is a proxy between AI clients (e.g. OpenCode) and upstream inference providers. Its purpose is to reduce token usage while preserving the semantic fidelity of requests and responses.

The system implements a **fixed-order pipeline** of transformation stages, each responsible for one aspect of context reduction.

## Pipeline (9 stages)

```
collect → measure → budget → summarize → prune → dedupe → compress → retrieve → forward
```

| Stage | Purpose | Always runs | Modifies request |
|-------|---------|-------------|------------------|
| collect | Validate and normalize incoming request | Yes | No |
| measure | Estimate token count (input) | Yes | No |
| budget | Reserve output token budget | Yes | No |
| summarize | Generate deterministic shadow summary of full context | Yes (v0.5+) | No (writes to state) |
| prune | Remove low-value, duplicate, or echo messages | Yes | When enabled |
| dedupe | Deduplicate remaining content | Configurable | When enabled |
| compress | Compress individual message content | Configurable | When enabled |
| retrieve | Fetch external context (future) | Yes | No |
| forward | Send final request to upstream provider | Yes | N/A (produces response) |

### Order constraint

The pipeline order is fixed at startup and must never be rearranged dynamically. Stages are pure or explicitly side-effecting — no hidden state.

Summarize runs **before** prune (v0.6+) so that the shadow summary's key points can inform advisory pruning scores. This is a intentional reorder from earlier versions where summarize followed prune.

## Architecture layers

```
┌─────────────────────────────────────────────────┐
│                  Transport Layer                │
│  Hono HTTP server (/v1/chat/completions, etc.)  │
├─────────────────────────────────────────────────┤
│              Transformation Layer               │
│  Pipeline runner → Stage definitions → Analyzer │
├─────────────────────────────────────────────────┤
│                Storage Layer                    │
│  SQLite: traces, snapshots, summaries           │
└─────────────────────────────────────────────────┘
```

Maintained as strict separation: no stage directly accesses storage or transport.

## Key design decisions

### Shadow mode
All pruning and transformations run in "shadow" by default — the system records what it *would* remove but does not modify the request. Shadow mode enables safe evaluation before enabling transformations in production.

### Traceability
Every pipeline run produces a trace (array of `StageResult` objects) included in the API response. Each trace entry records:
- Stage name and status
- Execution metadata (token counts, decisions, confidence scores)
- Advisory influence (v0.6+)

### Deterministic algorithms
All compression logic uses rule-based heuristics, not ML or embeddings. This ensures predictable, explainable behavior.

## HTTP endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/chat/completions` | POST | Main proxy endpoint |
| `/metrics` | GET | Summary statistics |
| `/health` | GET | Health check |

## Source layout

```
src/
├── index.ts               Entry point, wires stages into pipeline
├── config/index.ts        Configuration interface and defaults
├── compression/
│   ├── index.ts           Stage definitions (collect, measure, budget, prune, dedupe, compress, retrieve, forward)
│   ├── prune.ts           Pruning engine (3 detection rules + advisory scoring)
│   └── summarize.ts       Deterministic summary extraction + storage wiring
├── metrics/index.ts       MetricsCollector and MetricRecord
├── pipeline/
│   ├── index.ts           Pipeline runner with stage iteration and logging
│   └── types.ts           Core types (StageResult, PipelineContext, StageDecision, etc.)
├── providers/
│   ├── interface.ts       Provider interface
│   └── mockProvider.ts    Mock upstream for testing
├── server/http.ts         Hono server with validation, streaming, metrics
├── storage/sqlite.ts      SQLite backend (traces, snapshots, summaries)
└── types/index.ts         Shared types (ChatMessage, ChatCompletionRequest, etc.)
```

## Invariants

- User intent must never be altered or inferred beyond explicit content
- Constraints must never be removed or weakened
- Missing information must not be hallucinated or reconstructed
- All transformations must be traceable
- Streaming must not be blocked or fully buffered
- Lossy operations must be explicit and logged
- If a rule conflicts with optimization: correctness wins
