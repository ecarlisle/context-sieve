# What context-sieve Is Not

This document explicitly lists what context-sieve is **not**, to prevent architectural misconceptions.

---

## Not a Prompt Optimizer

**Common misconception:** "It rewrites my prompts to get better results."

**Reality:** context-sieve removes redundant or low-signal content from the context window. It does not:
- Rewrite instructions
- Add examples or reasoning steps
- Reformat prompts for different models
- Inject system prompts
- Improve response quality

If your prompt says "summarize this document" and the pipeline prunes a low-signal paragraph, that is removal of redundancy — not optimization for quality. The pipeline preserves user intent but does not enhance it.

**What this means for correctness:** The provider still sees the same intent. It may see less content. If the removed content was genuinely necessary, that is a bug in the pruning stage, not a feature of the system.

---

## Not a Vector Search System

**Common misconception:** "It searches for similar content across conversations."

**Reality:** context-sieve's search is metadata-only. The `SearchIndex` maintains an in-memory `Map<runId, IndexEntry>` keyed by:
- Run ID
- Stage names present in the trace
- Annotation types, authors, and text
- Whether the run has a summary, diff, or causal chain
- Summary confidence score

There is:
- No embeddings
- No vector database
- No semantic similarity
- No cosine distance
- No nearest-neighbor search

**What this means for correctness:** Search finds exactly what you ask for — runs with annotations by a specific author, runs where the prune stage fired, runs with high-confidence summaries. It does not find "runs similar to this one."

---

## Not an LLM Orchestration System

**Common misconception:** "It manages multi-step agent workflows."

**Reality:** context-sieve handles exactly one request → one response. It has no:
- Conversation state or memory
- Multi-step chaining
- Tool execution
- Conditional branching between requests
- Agent loop

Each request is independent. The system does not know about previous requests, does not maintain a session, and does not coordinate between multiple LLM calls.

**What this means for correctness:** If your agent makes three LLM calls to complete a task, context-sieve sees three independent requests. It records three independent snapshots. There is no cross-request analysis.

---

## Not a Semantic Reasoning Engine

**Common misconception:** "It understands what my content means."

**Reality:** context-sieve operates on structure and statistics, not semantics:
- Pruning uses heuristic scores (redundancy detection, signal strength), not semantic understanding.
- Summarization uses extractive key-point extraction, not generative rewriting.
- Compression removes exact duplicates, not near-duplicates.
- Regression detection compares structural metrics (token counts, stage presence), not response quality.

**What this means for correctness:** The system never interprets meaning. If a message says "This is very important" and another says "This is not important," the system treats both as strings with equal priority — unless heuristics indicate otherwise.

---

## Not an Agent Runtime

**Common misconception:** "I can deploy agents inside the proxy."

**Reality:** context-sieve has no agent execution environment. It cannot:
- Run agent loops
- Execute tool calls
- Manage state between iterations
- Handle user interaction mid-request
- Coordinate multi-agent systems

Agents run outside the proxy. They connect to the proxy the same way any other OpenAI-compatible client does.

---

## Not a Replacement for Provider APIs

**Common misconception:** "I don't need to manage provider API keys anymore."

**Reality:** context-sieve routes to providers but does not replace them. You still need:
- Provider accounts
- API keys (stored as environment variables)
- Provider-specific billing
- Provider-specific rate limits and quotas

The proxy abstracts routing, not the relationship with the provider.

---

## Not Real-Time

**Common misconception:** "Changes to config take effect immediately."

**Reality:** Provider config, routing rules, and pipeline settings are loaded at startup. Changing a YAML file requires a restart. There is no hot-reload, no dynamic reconfiguration, no live config endpoint.

---

## Not Horizontally Scalable (Yet)

**Common misconception:** "I can run multiple instances behind a load balancer."

**Reality:** context-sieve is a single-process system. Snapshots are stored on the local filesystem. SQLite is the database. There is no shared state between instances. Running multiple instances would produce inconsistent snapshot IDs and split observability data.

---

## What It IS (Recap)

| context-sieve IS | context-sieve IS NOT |
|-----------------|---------------------|
| Deterministic context transformation system | Prompt optimizer |
| Observability and replay system | Vector search engine |
| Provider routing layer | LLM orchestration platform |
| Structural analysis engine | Semantic reasoning engine |
| Immutable snapshot recorder | Agent runtime |
| Fixed-order pipeline executor | Real-time config system |
| Single-process proxy service | Horizontally scalable cloud service |

---

## Why This Distinction Matters

Every misconception above leads to incorrect assumptions about system behavior:

- If you treat it as a prompt optimizer, you'll expect quality improvements that never come.
- If you treat it as a vector search, you'll look for semantic results that don't exist.
- If you treat it as an orchestrator, you'll try to build stateful workflows that break.
- If you treat it as an agent runtime, you'll look for execution hooks that aren't there.

By understanding what the system is NOT, you build correct mental models of what it CAN do.
