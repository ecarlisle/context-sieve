import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import type { Annotation } from './types.js'

// fallow-ignore-next-line code-duplication
export class AnnotationStore {
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
      CREATE TABLE IF NOT EXISTS annotations (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        frame_index INTEGER NOT NULL,
        stage TEXT,
        author TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('note', 'question', 'issue', 'insight', 'decision')),
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_annotations_run_id ON annotations(run_id)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_annotations_run_frame ON annotations(run_id, frame_index)
    `)
  }

  // fallow-ignore-next-line unused-class-member
  createAnnotation(annotation: Annotation): void {
    const stmt = this.db.prepare(`
      INSERT INTO annotations (id, run_id, frame_index, stage, author, type, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      annotation.id,
      annotation.runId,
      annotation.frameIndex,
      annotation.stage ?? null,
      annotation.author,
      annotation.type,
      annotation.content,
      annotation.createdAt,
    )
  }

// fallow-ignore-next-line unused-class-member
  getAnnotations(runId: string): Annotation[] {
    const rows = this.db
      .prepare('SELECT * FROM annotations WHERE run_id = ? ORDER BY created_at ASC')
      .all(runId) as Array<{
      id: string
      run_id: string
      frame_index: number
      stage: string | null
      author: string
      type: string
      content: string
      created_at: number
    }>

    return rows.map(mapRow)
  }

// fallow-ignore-next-line unused-class-member
  getAnnotationsForFrame(runId: string, frameIndex: number): Annotation[] {
    const rows = this.db
      .prepare('SELECT * FROM annotations WHERE run_id = ? AND frame_index = ? ORDER BY created_at ASC')
      .all(runId, frameIndex) as Array<{
      id: string
      run_id: string
      frame_index: number
      stage: string | null
      author: string
      type: string
      content: string
      created_at: number
    }>

    return rows.map(mapRow)
  }

  listAnnotations(limit = 100): Annotation[] {
    const rows = this.db
      .prepare('SELECT * FROM annotations ORDER BY created_at DESC LIMIT ?')
      .all(limit) as Array<{
      id: string
      run_id: string
      frame_index: number
      stage: string | null
      author: string
      type: string
      content: string
      created_at: number
    }>

    return rows.map(mapRow)
  }

  close(): void {
    this.db.close()
  }
}

function mapRow(row: {
  id: string
  run_id: string
  frame_index: number
  stage: string | null
  author: string
  type: string
  content: string
  created_at: number
}): Annotation {
  return {
    id: row.id,
    runId: row.run_id,
    frameIndex: row.frame_index,
    stage: row.stage ?? undefined,
    author: row.author,
    type: row.type as Annotation['type'],
    content: row.content,
    createdAt: row.created_at,
  }
}
