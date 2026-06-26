# Provider Comparison Explained

## Why Did Three Models Answer Differently?

You sent the same prompt to three different providers and got three different responses. This is expected, and here's why.

### Deterministic Pipeline vs Stochastic Inference

**The pipeline is deterministic.** The collect, measure, budget, summarize, prune, dedupe, compress, and retrieve stages will produce the same result every time, given the same input. This is by design — it ensures that any difference between multi-runs is caused by the provider, not by the pipeline.

**The provider is stochastic.** LLMs are probabilistic. The same model with the same input can produce different outputs on different calls (temperature > 0). Different models from different providers will produce even more varied outputs because they have:

- Different training data
- Different architectures
- Different tokenizers
- Different optimization targets

### Provider Variance

| Provider | Typical Characteristics |
|----------|------------------------|
| OpenAI (GPT-4o) | Verbose, structured, prefers bullet points |
| Anthropic (Claude) | Detailed, safety-conscious, analytical |
| OpenRouter | Depends on underlying model |
| Ollama (local) | Smaller models, faster but less capable |
| LM Studio (local) | Variable, depends on loaded model |

### Context Sensitivity

The prune and budget stages run before the request reaches the provider. They process the same input regardless of provider. However:

- If the context exceeds the model's context window, behavior differs
- Different providers have different context windows
- Token estimation errors may affect one provider differently than another

---

## Example: Comparing Outputs

**Prompt:** "Explain the difference between TCP and UDP in three sentences."

| Provider | Response | Tokens | Latency |
|----------|----------|--------|---------|
| OpenAI | "TCP is connection-oriented, meaning it establishes a reliable connection before transmitting data, ensuring all packets arrive in order. UDP is connectionless, sending packets without confirmation, which makes it faster but less reliable. TCP is used for web browsing and email, while UDP is used for streaming and gaming." | 56 | 450ms |
| Anthropic | "TCP (Transmission Control Protocol) guarantees delivery through acknowledgment packets and retransmission, making it reliable but slower. UDP (User Datagram Protocol) sends packets without verification, prioritizing speed over reliability. Choose TCP when data integrity matters, UDP when speed matters." | 48 | 380ms |
| OpenRouter | "TCP is reliable, ordered, and connection-oriented. UDP is faster, unordered, and connectionless. TCP ensures data arrives correctly, UDP does not guarantee delivery." | 28 | 890ms |

### Divergence Analysis

| Metric | Value |
|--------|-------|
| Token variance | 24.2% (moderate) |
| Latency variance | 227ms (low) |
| Divergence score | 0.18 (low-moderate) |

All three responses cover the same concepts. Differences are in:

- **Length:** OpenRouter's response is significantly shorter (28 vs 56 tokens)
- **Structure:** OpenAI uses examples, Anthropic focuses on technical precision
- **Latency:** OpenRouter is slowest (likely routing overhead)

### Interpretation

The divergence is low-moderate because all responses describe the same core concepts. The structural differences (length, detail level) don't affect the factual accuracy of the response.

---

## Failure Cases

### Provider Mismatch

One provider returns an error while others succeed:

```
openai:     OK (142 tokens)
anthropic:  OK (178 tokens)
openrouter: ERROR (HTTP 429 rate limited)
```

**Resolution:** The comparison report includes only successful runs. The failed run is excluded from metrics but the error is noted.

### Partial Response

One provider returns a truncated response:

```
openai:     "TCP is connection-oriented..." (complete)
anthropic:  "TCP (Transmission" (truncated — 15 tokens)
```

**Resolution:** The snapshot records the partial response. The comparison report includes truncated data. High token variance for the truncated provider.

### Pipeline Error

A stage fails for one run but not others:

```
Run A: pipeline succeeds, provider called
Run B: prune stage error — pipeline continues, provider still called
```

**Resolution:** Each run's pipeline trace captures the error. The comparison report includes the failed stage's metrics. The provider call is still made unless the error prevents it.

---

## Key Takeaways

1. **Different outputs are normal.** Providers are different systems trained differently.
2. **Divergence does not mean error.** High divergence may indicate the prompt is ambiguous or open-ended.
3. **Low divergence is not always good.** Providers may agree on an incorrect answer.
4. **Structural comparison complements human review.** Use divergence metrics to flag runs that need manual inspection, not to determine correctness.
5. **Isolation is the foundation.** Each run is fully independent, ensuring that comparisons are valid.
