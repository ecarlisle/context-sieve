# Documentation Style Guide

## Tone

- **Direct and precise.** Avoid marketing language. State facts.
- **Explain what the system does, not what it should do.**
- **Contradictions are errors.** If two docs disagree, one is wrong.

## Structure

Every document must have:

1. **Title** — `# Title` at the top
2. **Purpose** — Within first 3 lines, state what this document explains
3. **Version header** — A comment or metadata block:
   ```
   <!-- Introduced: v2.0 | Updated: v2.1.2 | Applies to: all -->
   ```
4. **Content** — Body
5. **Cross-links** — Link to related documents
6. **Common Misconceptions** — Optional closing section

## Terminology

Use terms from `docs/meta/terminology.md`. Do not introduce synonyms.

### Correct:
- "execution" (not "pipeline run")
- "snapshot" (not "record")
- "fixture" (not "golden run")
- "verbose mode" (not "debug mode")

## Diagrams

Use ASCII diagrams with monospace characters. No image formats (SVG, PNG).

### Format:

```
┌──────────┐    ┌──────────┐
│ Stage A  │───►│ Stage B  │
└──────────┘    └──────────┘
```

### Rules:
- Box width should be consistent within a diagram
- Direction arrows: `──►` or `──►`
- Labels above or below arrows
- No color, no shading, no Unicode art

## Code Examples

1. Use TypeScript for code examples
2. Use bash for CLI examples
3. Use YAML for configuration examples
4. Use SQL for schema examples

Format with triple backticks and language identifier:

```typescript
const result = await pipeline.run(ctx)
```

## Cross-References

Link to other docs using relative paths from the `docs/` directory:

```markdown
See [Execution Guarantees](../core/execution-guarantees.md) for details.
```

Always link the first mention of a term in a document if it is defined elsewhere.

## Change Log

Each document's version comment includes `Introduced`, `Updated`, and `Applies To`. Update `Updated` when editing content. Update `Applies To` when the document's scope changes.

## Truth

Documentation must match the code. If code behavior changes, update docs in the same PR. Do not check in incomplete documentation changes.
