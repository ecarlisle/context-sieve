# Storage Schema

## Overview

context-sieve uses two storage backends:

1. **Filesystem (JSON)** — Snapshots, replay artifacts, workspaces
2. **SQLite** — Annotations, request traces

Both are local to the running process. There is no remote storage, no shared database, and no replication.

---

## Filesystem Storage

### Snapshots Directory

```
data/snapshots/
├── snap-1712345678901-a1b2c3.json
├── snap-1712345678902-d4e5f6.json
└── snap-1712345678903-g7h8i9.json
```

Each file is a complete `RunSnapshot` as JSON. Files are write-once — created during execution and never modified.

**Immutability constraint:** The snapshot store never overwrites an existing file. If a snapshot ID collides (astronomically unlikely given the timestamp + random suffix), the write fails.

### Replay Directory

```
data/replay/
├── snap-1712345678901-a1b2c3/
│   ├── frames.json       # TimelineFrame[]
│   └── meta.json         # Replay metadata
├── snap-1712345678902-d4e5f6/
│   ├── frames.json
│   └── meta.json
└── ...
```

Replay artifacts are generated after execution. They are pure projections of the snapshot — no external data is needed.

### Workspaces Directory

```
data/workspaces/
├── default.json
├── experiment-1.json
└── ...
```

Workspaces are user-defined collections of snapshot IDs, annotations, and plugin enable/disable state. Stored as JSON for portability and manual editing.

---

## SQLite Schema

### Database File

```
data/context-sieve.db
```

Created automatically on first run. Append-only — rows are inserted but never updated or deleted (with one exception: annotation deletion).

### Table: request_traces

Stores lightweight request metadata for quick queries.

```sql
CREATE TABLE request_traces (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id    TEXT NOT NULL,       -- response.id from the request
  model         TEXT NOT NULL,       -- model name used
  input_tokens  INTEGER NOT NULL,    -- estimated input token count
  output_tokens INTEGER NOT NULL,    -- estimated output token count
  latency_ms    INTEGER NOT NULL,    -- total request latency
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_request_traces_model ON request_traces(model);
CREATE INDEX idx_request_traces_created ON request_traces(created_at);
```

**Append-only:** Rows are inserted once via `storage.insertRequestTrace()`. No update or delete operations are exposed.

### Table: annotations

Stores user annotations attached to timeline frames.

```sql
CREATE TABLE annotations (
  id            TEXT PRIMARY KEY,          -- UUID
  run_id        TEXT NOT NULL,             -- snapshot ID
  frame_index   INTEGER NOT NULL,          -- timeline frame index
  stage         TEXT,                      -- optional stage name
  author        TEXT NOT NULL DEFAULT 'anonymous',
  type          TEXT NOT NULL CHECK(type IN ('note','question','issue','insight','decision')),
  content       TEXT NOT NULL,
  created_at    INTEGER NOT NULL           -- epoch ms
);

CREATE INDEX idx_annotations_run ON annotations(run_id);
CREATE INDEX idx_annotations_author ON annotations(author);
CREATE INDEX idx_annotations_type ON annotations(type);
```

**Append-only:** Annotations are created but never updated. Deletion is supported via the `AnnotationStore.deleteAnnotation()` method, which removes the row entirely.

---

## Immutability Constraints

| Store | Write Policy | Update Policy | Delete Policy |
|-------|-------------|---------------|---------------|
| Snapshots (filesystem) | Write-once | Not supported | File deletion |
| Replay artifacts (filesystem) | Write-once | Not supported | Directory deletion |
| Workspaces (filesystem) | Write-once per file | Full file rewrite | File deletion |
| request_traces (SQLite) | Append-only INSERT | Not supported | Not supported |
| annotations (SQLite) | Append-only INSERT | Not supported | Row deletion allowed |

---

## Why Two Storage Backends

### Filesystem for Snapshots

- **Portability:** Snapshots are plain JSON. Open in any editor, process with any tool.
- **No migration needed:** JSON format evolves with the code. No schema migrations.
- **Durability:** No database corruption risk for the primary artifact.
- **Simplicity:** No connection management, no connection pooling, no WAL.

### SQLite for Annotations and Traces

- **Indexed queries:** Find annotations by author, type, or run ID efficiently.
- **Structured metadata:** Request traces need numeric aggregation (average latency, total tokens).
- **Lightweight:** Single file, zero configuration, no server process.

### What Is NOT Stored

- Provider API keys (environment variables only)
- Runtime metrics counters (in-memory `MetricsCollector`, reset on restart)
- Pipeline stage code (in source, not in storage)
- Plugin binaries (loaded from filesystem at runtime)

---

## Common Failure Modes

**"I deleted a snapshot file. Can I recover it?"**
No. Snapshots are not backed up. Re-run the request to create a new snapshot.

**"SQLite database is locked."**
The database uses a single connection. Concurrent access from multiple processes is not supported. Only one context-sieve instance may run at a time.

**"Snapshot directory is empty."**
No requests have been processed, or the snapshot store is configured with a different path. Check `SnapshotStore` construction.

**"Annotations are missing from replay."**
Annotation store may be using a different SQLite file, or the snapshot was loaded before the annotation store was initialized. Check that both stores point at the same `data/` directory.
