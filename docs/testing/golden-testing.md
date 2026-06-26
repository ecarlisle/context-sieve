# Golden Testing

> **See also:** [Golden Replay Suites](golden-replay-suites.md) for running golden tests in batch against replay data.

Golden tests validate behavioral consistency — they answer "did behavior change?"

## How It Works

1. A fixture file (JSON) defines an input request and expected trace
2. The pipeline executes against the fixture
3. The actual trace is compared against the expected trace
4. A snapshot is captured and round-tripped through JSON

## Fixtures

Located in `tests/fixtures/`:

| Fixture | Description |
|---------|-------------|
| `trivial.json` | Single user message, minimal content |
| `medium.json` | Multi-turn conversation with system prompt |
| `heavy.json` | Long conversation with large message bodies |

Each fixture contains:
- `request.model` — the model name
- `request.messages` — the message array
- `expectedTrace` — the expected stage order
- `description` — human-readable intent

## Adding a Golden Test

1. Create a new JSON fixture in `tests/fixtures/`
2. The golden test runner automatically discovers `.json` files
3. Run `pnpm test:golden` to validate

## What Golden Tests Validate

- Stage ordering matches expectations
- All expected stages are present
- Snapshot structure is valid
- JSON round-trip preserves all fields
- Each trace entry has a decision attached
