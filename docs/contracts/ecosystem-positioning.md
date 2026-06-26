# Ecosystem Positioning

> **See also:** [What context-sieve Is Not](../core/what-it-is-not.md) — the canonical anti-misconceptions reference. This document focuses on ecosystem comparisons.

## What context-sieve IS

**A deterministic execution observability system for context transformations.**

context-sieve sits between an AI agent (OpenCode) and an inference provider (OpenAI, Anthropic, etc.). It records every transformation applied to the request and response — stage by stage — producing an immutable snapshot that can be inspected, replayed, and compared.

It is an **observability layer**, not a framework. It observes, records, and replays. It does not execute agent logic, manage agent state, or make decisions on behalf of the agent.

---

## What context-sieve Is NOT

### NOT LangChain

LangChain is a framework for building LLM-powered applications. It provides chains, agents, tools, memory, and model abstractions. You build applications _with_ LangChain.

context-sieve is an observability layer. You place it _between_ your application and the provider. It does not help you build applications. It helps you understand what your application did.

| Aspect | LangChain | context-sieve |
|--------|-----------|---------------|
| Purpose | Build LLM applications | Observe LLM request transformations |
| Abstraction level | High (chains, agents, tools) | Low (pipeline stages, snapshots) |
| State management | Built-in (memory, agent state) | None (external) |
| Observability | Callbacks, runnable config | Core feature (snapshots, replay) |
| Provider abstraction | Yes (many integrations) | Yes (adapter pattern) |
| Persistence | Built-in (document loaders, vector stores) | Snapshot filesystem + SQLite |
| Replay | Not a core feature | Core feature |
| Determinism | Not guaranteed | Guaranteed per snapshot |

**Can they work together?** Yes. Wrap the LangChain application's provider call with context-sieve's HTTP endpoint. context-sieve observes the requests and responses without interfering with LangChain's logic.

---

### NOT an Agent Framework

Agent frameworks (LangGraph, CrewAI, AutoGPT, etc.) manage agent loops, tool execution, task decomposition, and multi-agent coordination. They decide _what_ the agent does.

context-sieve records _what happened_ during a single request-response cycle. It has no concept of agents, tasks, loops, or goals.

| Aspect | Agent Frameworks | context-sieve |
|--------|-----------------|---------------|
| Scope | Multi-step agent execution | Single request-response |
| State | Agent state, task queue, tool results | None (external) |
| Orchestration | Agent loop, sub-agents, handoffs | Fixed pipeline (no dynamic branching) |
| Decision making | LLM calls, tool selection, planning | None (observes only) |
| Session management | Built-in | Not provided |

**Can they work together?** Yes. Use context-sieve as a proxy between the agent framework and the LLM provider. Each agent step produces one snapshot. The sequence of snapshots constitutes the agent's execution trace.

---

### NOT an Embedding System

Embedding systems (OpenAI Embeddings, Cohere, sentence-transformers, vector databases) convert text into vector representations for semantic search, clustering, and retrieval.

context-sieve does not compute embeddings. It does not store vectors. It does not perform semantic search.

| Aspect | Embedding Systems | context-sieve |
|--------|------------------|---------------|
| Purpose | Convert text to vectors | Record request transformations |
| Semantic understanding | Core feature | None |
| Search | Semantic/vector search | Exact-match metadata search only |
| Storage | Vector database | Filesystem JSON + SQLite |
| Use case | RAG, clustering, similarity | Debugging, audit, regression |

**Can they work together?** Yes. context-sieve can record what was embedded, but it does not perform embedding itself. Use a dedicated embedding pipeline for vector computation.

---

### NOT a Semantic Reasoning Engine

Semantic reasoning engines (BERT, GPT, Claude, etc.) understand and generate natural language. They reason about content, infer meaning, and produce responses.

context-sieve does not reason about anything. It does not understand the content it observes. It records transformations (timestamps, stage results, token counts) without semantic interpretation.

| Aspect | Reasoning Engines | context-sieve |
|--------|-------------------|---------------|
| Purpose | Understand and generate language | Record and replay events |
| Intelligence | Core feature | None |
| Content awareness | Full semantic understanding | None (opaque bytes) |
| Decision making | Autonomous | None (fixed pipeline) |
| Hallucination risk | Yes | No (no generation) |

**Can they work together?** Yes. context-sieve sits in front of the reasoning engine. The engine does the reasoning; context-sieve records the interaction.

---

## Comparison Table

| Category | context-sieve | LangChain | Agent Frameworks | Embedding Systems | Reasoning Engines |
|----------|--------------|-----------|------------------|-------------------|-------------------|
| Observability | Core | Secondary | Secondary | Minimal | None |
| Determinism | High | Low | Low | High | Low |
| State management | None | Built-in | Built-in | Built-in | None (stateless) |
| Provider abstraction | Yes (adapter) | Yes (many) | Yes (limited) | Yes (limited) | Native |
| Persistence | Snapshots + SQLite | Document loaders | Task state | Vector DB | None |
| Replay | Core feature | Not provided | Not provided | Not provided | Not provided |
| Semantic understanding | None | Via LLM | Via LLM | Core feature | Core feature |
| Pipeline | Fixed 9-stage | Custom chains | Custom graphs | None | None |
| Plugin system | Yes | Yes | Limited | No | No |
| Security model | Formal boundaries | Implicit | Implicit | Authentication | API keys |

---

## System Identity

context-sieve is:

```
A deterministic, auditable, replayable observability layer
for context transformations between AI agents and inference providers.
```

It is **not** a platform, framework, or engine. It is a single-purpose tool with a narrow scope:

1. **Accept** a request from OpenCode.
2. **Transform** it through a fixed pipeline.
3. **Send** it to a provider.
4. **Record** every transformation as an immutable snapshot.
5. **Allow** inspection, replay, comparison, and annotation.

Everything else — agent logic, provider selection, caching, retry, fallback — is external.

---

## Why context-sieve Exists

### Problem

AI agents transform context (pruning, summarizing, deduplicating) before sending to providers. These transformations are invisible. When output is wrong, there is no way to know whether the agent made a bad transformation or the provider gave a bad response.

### Solution

context-sieve makes every transformation visible by recording each stage's decision in an immutable, inspectable, replayable snapshot.

### What Makes It Different

1. **Snapshots are immutable.** Once written, they are never modified. This is different from logging systems that aggregate and summarize over time, losing individual event detail.
2. **Replay is not re-execution.** Replay is a projection of stored data, with no network access. This is different from debugging tools that reproduce by re-running.
3. **Pipeline order is fixed.** Stages cannot be reordered dynamically. This is different from LangChain and agent frameworks where chains and graphs are flexible. Fixed order enables deterministic traceability.
4. **No semantic understanding.** context-sieve does not know what the content means. It records byte counts, timestamps, and structural changes. This is different from observability tools that analyze content for insights.

---

## Integration Patterns

### As a Reverse Proxy

```
OpenCode ──► context-sieve ──► Provider API
```

The most common deployment. OpenCode sends requests to context-sieve, which proxies them to the provider after recording.

### As an Inline Library

```typescript
import { createPipeline } from 'context-sieve'

const result = await pipeline.run(request)
// result contains the snapshot
```

Direct API usage for programmatic control.

### As a Data Source

```
Snapshots (filesystem) ──► External analysis pipeline
Annotations (SQLite)    ──► External monitoring
```

Snapshots and annotations can be consumed by external tools (Grafana, custom dashboards, CI/CD pipelines).

---

## What Developers Usually Misunderstand

**"context-sieve is like Langfuse or LangSmith."**
Partially. Those tools focus on LLM observability and tracing of multi-step agents. context-sieve focuses on single-request observability with deeper per-stage detail, immutable snapshots, and deterministic replay. The scopes overlap but the approaches differ.

**"I can use context-sieve to build an agent."**
No. context-sieve has no agent loop, no task management, no decision making. Use an agent framework for building agents and context-sieve for observing them.

**"context-sieve is an AI product."**
No. context-sieve has no AI components. It does not reason, understand, or generate content. It records and replays.

**"context-sieve replaces logging."**
No. context-sieve augments logging with structured, replayable snapshots. Logs are still useful for real-time monitoring and alerts.

**"I can run context-sieve without a provider."**
Yes. Use the MockProvider for development and testing. Snapshot, replay, and analysis work without any external service.

**"context-sieve is a caching proxy."**
No. context-sieve records every request. It does not cache or deduplicate requests. It records transformations applied to each individual request.
