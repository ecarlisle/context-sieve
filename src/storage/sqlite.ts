import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'

export class Storage {
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
      CREATE TABLE IF NOT EXISTS request_traces (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        latency_ms INTEGER NOT NULL,
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS metrics_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot TEXT NOT NULL,
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS summaries (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        source_message_ids TEXT NOT NULL,
        summary_text TEXT NOT NULL,
        key_points TEXT NOT NULL,
        confidence REAL NOT NULL
      );
    `)
  }

  insertSummary(summary: {
    id: string
    sourceIds: string[]
    summary: string
    keyPoints: string[]
    confidence: number
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO summaries (id, source_message_ids, summary_text, key_points, confidence)
      VALUES (?, ?, ?, ?, ?)
    `)
    stmt.run(
      summary.id,
      JSON.stringify(summary.sourceIds),
      summary.summary,
      JSON.stringify(summary.keyPoints),
      summary.confidence,
    )
  }

  // fallow-ignore-next-line unused-class-member
  getRecentSummaries(limit = 10): Array<{
    id: string
    timestamp: string
    sourceMessageIds: string[]
    summaryText: string
    keyPoints: string[]
    confidence: number
  }> {
    const rows = this.db
      .prepare('SELECT * FROM summaries ORDER BY rowid DESC LIMIT ?')
      .all(limit) as Array<{
      id: string
      timestamp: string
      source_message_ids: string
      summary_text: string
      key_points: string
      confidence: number
    }>

    return rows.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      sourceMessageIds: JSON.parse(r.source_message_ids),
      summaryText: r.summary_text,
      keyPoints: JSON.parse(r.key_points),
      confidence: r.confidence,
    }))
  }

  insertRequestTrace(trace: {
    requestId: string
    model: string
    inputTokens: number
    outputTokens: number
    latencyMs: number
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO request_traces (request_id, model, input_tokens, output_tokens, latency_ms)
      VALUES (?, ?, ?, ?, ?)
    `)
    stmt.run(trace.requestId, trace.model, trace.inputTokens, trace.outputTokens, trace.latencyMs)
  }

  // fallow-ignore-next-line unused-class-member
  getRecentTraces(limit = 10): Array<{
    id: number
    requestId: string
    model: string
    inputTokens: number
    outputTokens: number
    latencyMs: number
    timestamp: string
  }> {
    const rows = this.db
      .prepare('SELECT * FROM request_traces ORDER BY id DESC LIMIT ?')
      .all(limit) as Array<{
      id: number
      request_id: string
      model: string
      input_tokens: number
      output_tokens: number
      latency_ms: number
      timestamp: string
    }>

    return rows.map(r => ({
      id: r.id,
      requestId: r.request_id,
      model: r.model,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      latencyMs: r.latency_ms,
      timestamp: r.timestamp,
    }))
  }

  // fallow-ignore-next-line unused-class-member
  close(): void {
    this.db.close()
  }
}
