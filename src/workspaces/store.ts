import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Workspace, CreateWorkspaceInput } from './types.js'

const WORKSPACES_DIR = path.join(process.cwd(), 'data', 'workspaces')

function ensureDir(): void {
  if (!fs.existsSync(WORKSPACES_DIR)) {
    fs.mkdirSync(WORKSPACES_DIR, { recursive: true })
  }
}

function filePath(id: string): string {
  return path.join(WORKSPACES_DIR, `${id}.json`)
}

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

// Methods called via Hono route dispatch — fallow cannot trace class member
// usage through dynamic handler dispatch, so these are false positives.
export class WorkspaceStore {
  // fallow-ignore-next-line unused-class-member
  createWorkspace(input: CreateWorkspaceInput): Workspace {
    ensureDir()
    const ws: Workspace = {
      id: randomUUID(),
      name: input.name,
      createdAt: Date.now(),
      runIds: [],
      replayIds: [],
      benchmarkIds: [],
      regressionIds: [],
      plugins: input.plugins ?? [],
    }
    fs.writeFileSync(filePath(ws.id), JSON.stringify(ws, null, 2), 'utf-8')
    return ws
  }

  getWorkspace(id: string): Workspace | null {
    const fp = filePath(id)
    if (!fs.existsSync(fp)) return null
    const raw = fs.readFileSync(fp, 'utf-8')
    return safeParse<Workspace>(raw)
  }

  // fallow-ignore-next-line unused-class-member
  listWorkspaces(): Workspace[] {
    ensureDir()
    const files = fs.readdirSync(WORKSPACES_DIR).filter(f => f.endsWith('.json')).sort().reverse()
    const result: Workspace[] = []
    for (const file of files) {
      const raw = fs.readFileSync(path.join(WORKSPACES_DIR, file), 'utf-8')
      const ws = safeParse<Workspace>(raw)
      if (ws) result.push(ws)
    }
    return result
  }

  // fallow-ignore-next-line unused-class-member
  addRunToWorkspace(workspaceId: string, runId: string): Workspace | null {
    const ws = this.getWorkspace(workspaceId)
    if (!ws) return null
    if (!ws.runIds.includes(runId)) {
      ws.runIds.push(runId)
      fs.writeFileSync(filePath(ws.id), JSON.stringify(ws, null, 2), 'utf-8')
    }
    return ws
  }

  // fallow-ignore-next-line unused-class-member
  addReplayToWorkspace(workspaceId: string, replayId: string): Workspace | null {
    const ws = this.getWorkspace(workspaceId)
    if (!ws) return null
    if (!ws.replayIds.includes(replayId)) {
      ws.replayIds.push(replayId)
      fs.writeFileSync(filePath(ws.id), JSON.stringify(ws, null, 2), 'utf-8')
    }
    return ws
  }

  // fallow-ignore-next-line unused-class-member
  addPluginToWorkspace(workspaceId: string, pluginId: string): Workspace | null {
    const ws = this.getWorkspace(workspaceId)
    if (!ws) return null
    if (!ws.plugins.includes(pluginId)) {
      ws.plugins.push(pluginId)
      fs.writeFileSync(filePath(ws.id), JSON.stringify(ws, null, 2), 'utf-8')
    }
    return ws
  }

  // fallow-ignore-next-line unused-class-member
  removePluginFromWorkspace(workspaceId: string, pluginId: string): Workspace | null {
    const ws = this.getWorkspace(workspaceId)
    if (!ws) return null
    ws.plugins = ws.plugins.filter(p => p !== pluginId)
    fs.writeFileSync(filePath(ws.id), JSON.stringify(ws, null, 2), 'utf-8')
    return ws
  }
}
