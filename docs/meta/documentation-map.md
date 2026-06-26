# Documentation Map

## Graph Overview

```
README.md (System Entry Index)
  │
  ├── docs/core/            (mental model, guarantees, invariants, what-it-is-not)
  │     └── links to: contracts/, architecture.md
  │
  ├── docs/contracts/       (truth hierarchy, failure, versioning, consistency, metrics, pipeline, security, replay, plugins)
  │     └── links to: core/, providers/, replay/, observability/
  │
  ├── docs/providers/       (overview, routing, config, adapters, validation, security, debugging, selection)
  │     └── links to: contracts/security-boundaries, guides/
  │
  ├── docs/replay/          (replay-vs-execution, guarantees, timeline-model)
  │     └── links to: core/, contracts/replay-boundaries, debugging/
  │
  ├── docs/observability/   (design, metrics, trace-model, run-analysis)
  │     └── links to: contracts/metrics-semantics, data/, debugging/
  │
  ├── docs/testing/         (overview, unit, golden, snapshot, philosophy)
  │     └── links to: guides/, data/
  │
  ├── docs/debugging/       (workflows, failures, investigation-guide)
  │     └── links to: observability/, replay/, providers/
  │
  ├── docs/extensions/      (extension-model, plugin-lifecycle, boundaries)
  │     └── links to: contracts/plugin-conflict-model, plugins/, sdk/
  │
  ├── docs/security/        (trust-boundaries, security-model, logging)
  │     └── links to: contracts/security-boundaries
  │
  ├── docs/data/            (data-model, storage-schema)
  │     └── links to: replay/, observability/
  │
  ├── docs/multirun/        (overview, architecture, comparison, metrics, guides)
  │     └── links to: providers/, replay/
  │
  ├── docs/guides/          (first-run, provider-setup, golden-tests)
  │     └── links to: providers/, testing/, README
  │
  ├── docs/releases/        (v2.1.2 release notes)
  │     └── links to: CHANGELOG.md
  │
  ├── docs/plugins/         (plugin-guide, runtime-model, safety-model)
  │     └── links to: extensions/, sdk/
  │
  ├── docs/meta/            (THIS DIRECTORY — documentation governance)
  │
  ├── docs/architecture.md  → core/mental-model.md
  ├── docs/how-to-use.md    → guides/first-run.md
  ├── docs/pruning-system.md → core/pipeline-invariants.md
  └── docs/summaries-and-memory.md → core/pipeline-invariants.md
```

## Per-Document Details

### README.md
- **Purpose:** System entry index. Architecture diagram, learning paths, quick start, complete doc map, CLI reference.
- **Dependencies:** All doc areas
- **Linked By:** README.txt, CHANGELOG.md
- **Introduced:** v1.0, rewritten v2.1.2

### docs/core/mental-model.md
- **Purpose:** Four-layer architecture explanation. What the system is and how it thinks.
- **Dependencies:** None
- **Linked By:** README, docs/core/*, docs/architecture.md
- **Introduced:** v1.0

### docs/core/execution-guarantees.md
- **Purpose:** Invariants for pipeline order, snapshot immutability, determinism, provider isolation.
- **Dependencies:** mental-model.md
- **Linked By:** README, docs/core/*, docs/contracts/*
- **Introduced:** v1.0

### docs/core/what-it-is-not.md
- **Purpose:** Anti-misconceptions reference.
- **Dependencies:** mental-model.md
- **Linked By:** README, contracts/ecosystem-positioning.md
- **Introduced:** v1.0

### docs/core/pipeline-invariants.md
- **Purpose:** Stage ordering rules, noop semantics, decision isolation, forbidden operations.
- **Dependencies:** mental-model.md, execution-guarantees.md
- **Linked By:** README, contracts/pipeline-contracts.md
- **Introduced:** v1.0

### docs/contracts/truth-hierarchy.md
- **Purpose:** System-of-record precedence. Snapshot → trace → replay → metrics → logs.
- **Dependencies:** None
- **Linked By:** README, cross-layer-consistency.md
- **Introduced:** v1.0

### docs/contracts/failure-semantics.md
- **Purpose:** System behavior under every failure mode.
- **Dependencies:** truth-hierarchy.md
- **Linked By:** README, debugging/*
- **Introduced:** v1.0

### docs/contracts/versioning-model.md
- **Purpose:** Schema evolution, compatibility rules, migration expectations.
- **Dependencies:** None
- **Linked By:** releases/*
- **Introduced:** v1.0

### docs/contracts/cross-layer-consistency.md
- **Purpose:** Arbitration rules when layers disagree.
- **Dependencies:** truth-hierarchy.md
- **Linked By:** README
- **Introduced:** v1.0

### docs/contracts/metrics-semantics.md
- **Purpose:** Definitions, computation methods, error characteristics for all metrics.
- **Dependencies:** None
- **Linked By:** observability/metrics.md
- **Introduced:** v2.0

### docs/contracts/pipeline-contracts.md
- **Purpose:** Stage ordering, noop semantics, plugin ordering, conflict resolution.
- **Dependencies:** pipeline-invariants.md
- **Linked By:** extensions/*
- **Introduced:** v2.0

### docs/contracts/replay-boundaries.md
- **Purpose:** Replay assumptions, provider variability, why replay is not recomputation.
- **Dependencies:** replay/*
- **Linked By:** replay/replay-vs-execution.md
- **Introduced:** v2.0

### docs/contracts/security-boundaries.md
- **Purpose:** Boundary map, plugin data access, provider isolation, secrets lifecycle, logging restrictions.
- **Dependencies:** security/*
- **Linked By:** security/trust-boundaries.md, security/security-model.md
- **Introduced:** v2.0

### docs/contracts/plugin-conflict-model.md
- **Purpose:** Plugin interaction types, ordering rules, forbidden behaviors.
- **Dependencies:** extensions/*
- **Linked By:** extensions/extension-model.md
- **Introduced:** v2.0

### docs/contracts/ecosystem-positioning.md
- **Purpose:** Comparison with LangChain, agent frameworks, embedding systems.
- **Dependencies:** core/what-it-is-not.md
- **Linked By:** README
- **Introduced:** v2.0

### docs/providers/*
- **Purpose:** Provider architecture, routing, configuration, adapters, validation, security, debugging, selection.
- **Dependencies:** core/mental-model.md
- **Linked By:** README, guides/*
- **Introduced:** v1.0–v2.1.2

### docs/replay/*
- **Purpose:** Replay vs execution, guarantees, timeline model.
- **Dependencies:** core/mental-model.md, data/data-model.md
- **Linked By:** README, debugging/*
- **Introduced:** v1.0–v2.1.2

### docs/observability/*
- **Purpose:** Design philosophy, metrics, trace model, run analysis.
- **Dependencies:** core/mental-model.md
- **Linked By:** README, debugging/*
- **Introduced:** v2.0–v2.1.2

### docs/testing/*
- **Purpose:** Four-layer testing strategy, golden tests, snapshot tests.
- **Dependencies:** core/execution-guarantees.md
- **Linked By:** README, guides/*
- **Introduced:** v2.1.0

### docs/debugging/*
- **Purpose:** Workflows, failure modes, investigation guide.
- **Dependencies:** observability/*, replay/*
- **Linked By:** README
- **Introduced:** v1.0–v2.1.2

### docs/extensions/*
- **Purpose:** Plugin model, lifecycle, boundaries.
- **Dependencies:** contracts/plugin-conflict-model.md
- **Linked By:** README, plugins/*
- **Introduced:** v2.0–v2.1.2

### docs/security/*
- **Purpose:** Trust boundaries, security model, logging policy.
- **Dependencies:** contracts/security-boundaries.md
- **Linked By:** README
- **Introduced:** v2.0–v2.1.2

### docs/data/*
- **Purpose:** Entities, storage schema, immutability constraints.
- **Dependencies:** core/mental-model.md
- **Linked By:** README, replay/*
- **Introduced:** v1.0
