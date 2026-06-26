# Duplication Report

## Duplicate 1: "What It Is Not" Content

**Overlap:** ~80%

**Locations:**
1. `docs/core/what-it-is-not.md` — Full dedicated document, table format
2. `docs/core/mental-model.md` — Section "What context-sieve Is NOT" (8 bullet points)
3. `docs/contracts/ecosystem-positioning.md` — Extended comparison with LangChain, agent frameworks, embedding systems

**Resolution:** Keep `docs/core/what-it-is-not.md` as the canonical reference. Add a cross-reference from `mental-model.md` to the full document instead of duplicating content. `ecosystem-positioning.md` covers orthogonal ground (ecosystem comparisons) — keep it but cross-link.

**Action:**
- [ ] `mental-model.md`: Replace the "What context-sieve Is NOT" section with "See [What It Is Not](../core/what-it-is-not.md) for the full reference."
- [ ] `ecosystem-positioning.md`: Add note at top: "This document focuses on ecosystem comparisons. For the full anti-misconceptions reference, see [What It Is Not](../core/what-it-is-not.md)."

## Duplicate 2: Noop Semantics

**Overlap:** ~70%

**Locations:**
1. `docs/core/pipeline-invariants.md` — Section "Noop Semantics" + "Why This Distinction Matters"
2. `docs/contracts/pipeline-contracts.md` — Section "Noop Semantics" + "Distinguishing Noop from Skipped" + "Why This Matters"

**Resolution:** Keep the detailed explanation in `pipeline-invariants.md` (core). Make `pipeline-contracts.md` reference it: "See [Pipeline Invariants: Noop Semantics](../core/pipeline-invariants.md#noop-semantics) for the full definition."

**Action:**
- [ ] `pipeline-contracts.md`: Replace noop semantics section with cross-reference + contract-specific additions only.

## Duplicate 3: Stage Ordering

**Overlap:** ~60%

**Locations:**
1. `docs/core/pipeline-invariants.md` — Stage order with dependencies table
2. `docs/contracts/pipeline-contracts.md` — Stage order with insertion rules

**Resolution:** These cover different aspects (invariants vs contracts). The overlap is acceptable but each should cross-reference the other.

**Action:**
- [ ] Add cross-reference at top of `pipeline-contracts.md`: "This document expands on the stage ordering rules defined in [Pipeline Invariants](../core/pipeline-invariants.md)."

## Duplicate 4: Security Boundaries and Trust Boundaries

**Overlap:** ~50%

**Locations:**
1. `docs/security/trust-boundaries.md` — Trust model per boundary
2. `docs/security/security-model.md` — Security model overview
3. `docs/contracts/security-boundaries.md` — Expanded boundary map with plugin/provider scope

**Resolution:** These are complementary but overlapping. `contracts/security-boundaries.md` should be the authoritative reference; the `security/` docs should summarize and reference it.

**Action:**
- [ ] Add cross-references between all three documents.

## Duplicate 5: Metrics Content

**Overlap:** ~40%

**Locations:**
1. `docs/contracts/metrics-semantics.md` — Computation methods, error characteristics
2. `docs/observability/metrics.md` — Exposed metrics, CLI/PATH access

**Resolution:** These are complementary (contract vs reference). Add cross-links.

**Action:**
- [ ] Add link from `observability/metrics.md` to `contracts/metrics-semantics.md`
- [ ] Add link from `contracts/metrics-semantics.md` to `observability/metrics.md`
