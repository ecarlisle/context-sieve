# Multi-Provider Execution Comparison

## What It Is

A single request is executed across multiple inference providers independently. Each execution produces its own snapshot. The system then compares them structurally.

This is not load balancing, fallback routing, or ensemble voting. It is **deterministic multi-world execution comparison**.

```
Input Context
   │
   ├── Provider A ──► Snapshot A
   ├── Provider B ──► Snapshot B
   ├── Provider C ──► Snapshot C
   │
   └── Comparison Engine ──► Report
```

---

## Why It Exists

No single model is ground truth. Different providers (and different models from the same provider) produce different outputs for the same input. This is expected — providers have different training data, architectures, and optimization targets.

Multi-provider execution reveals **structural sensitivity**:

- Does the content change drastically between providers?
- Do token estimates vary significantly?
- Does the prune stage make different decisions for different providers?
- Are latency differences predictable?

By comparing multiple executions of the same input, you can distinguish between:

- **Provider-specific behavior** (this model tends to produce long responses)
- **Input-sensitive behavior** (this particular prompt causes one provider to prune differently)
- **Random variance** (same provider, different outputs on different runs)

---

## What This Is NOT

### NOT Ensemble Voting

Ensemble voting runs multiple models and aggregates their outputs into a single result (majority vote, weighted average, etc.). This system does not aggregate. It compares.

### NOT Fallback Routing

Fallback routing tries one provider, and if it fails, tries another. This system runs all providers simultaneously. Every run is independent.

### NOT Averaging Outputs

The system does not produce a merged output. It produces separate outputs and a comparison report. There is no single "answer."

---

## Deterministic Pipeline vs Stochastic Inference

The pipeline (collect → measure → budget → summarize → prune → dedupe → compress → retrieve → forward) is **deterministic for a given input**. The same input always produces the same pipeline decisions.

The provider call (forward stage) is **stochastic**. The same request to the same provider can produce different outputs.

Multi-provider execution isolates stochastic variance to the provider call. Pipeline decisions remain deterministic per run.

---

## When to Use

- **Testing provider consistency.** Does the same prompt produce similar outputs across providers?
- **Debugging provider-specific issues.** Does one provider produce anomalous token counts or latency?
- **Validating model selection.** Which provider gives the best output for your use case?
- **Regression detection.** Did a provider's behavior change after an update?

---

## When NOT to Use

- **Production request proxying.** Multi-provider execution increases latency and token usage.
- **Caching.** Each run is independent and isolated.
- **Streaming.** Multi-provider execution does not support streaming responses.
