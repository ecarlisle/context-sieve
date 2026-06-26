import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import type { RunSnapshot } from './types.js'

export class SnapshotStore {
  private db: Database.Database

  constructor(dbPath?: string) {
    const resolved = dbPath ?? path.join(process.cwd(), 'data', 'context-sieve.db')
    const dir = path.dirname(resolved)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    this.db = new Database(resolved)
    this.db.pragma('journal_mode = WAL')
    this.initialize()
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS run_snapshots (
        id TEXT PRIMARY KEY,
        snapshot_json TEXT NOT NULL,
        model TEXT NOT NULL DEFAULT '',
        metric_input_tokens INTEGER NOT NULL DEFAULT 0,
        metric_output_tokens INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      )
    `)
  }

  saveSnapshot(snapshot: RunSnapshot): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO run_snapshots (id, snapshot_json, model, metric_input_tokens, metric_output_tokens, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      snapshot.id,
      JSON.stringify(snapshot),
      snapshot.request.model,
      snapshot.metrics.inputTokens,
      snapshot.metrics.outputTokens,
      snapshot.timestamp,
    )
  }

  getSnapshotById(id: string): RunSnapshot | undefined {
    return this.loadSnapshot(id)
  }

  loadSnapshot(id: string): RunSnapshot | undefined {
    const row = this.db
      .prepare('SELECT snapshot_json FROM run_snapshots WHERE id = ?')
      .get(id) as { snapshot_json: string } | undefined

    if (!row) return undefined
    return JSON.parse(row.snapshot_json) as RunSnapshot
  }

  listSnapshots(limit = 20): Array<{
    id: string
    model: string
    inputTokens: number
    outputTokens: number
    createdAt: number
  }> {
    const rows = this.db
      .prepare(
        'SELECT id, model, metric_input_tokens, metric_output_tokens, created_at FROM run_snapshots ORDER BY created_at DESC LIMIT ?',
      )
      .all(limit) as Array<{
      id: string
      model: string
      metric_input_tokens: number
      metric_output_tokens: number
      created_at: number
    }>

    return rows.map(r => ({
      id: r.id,
      model: r.model,
      inputTokens: r.metric_input_tokens,
      outputTokens: r.metric_output_tokens,
      createdAt: r.created_at,
    }))
  }

  close(): void {
    this.db.close()
  }
}
