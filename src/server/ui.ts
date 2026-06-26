import { Hono } from 'hono'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { SnapshotStore } from '../snapshots/store.js'
import { getTimeline } from '../api/timeline.js'
import { diffTimelines } from '../timeline/diffTimeline.js'
import { exportReplay, ReplayStore } from '../replay/index.js'
import { AnnotationStore } from '../annotations/index.js'
import { SearchIndex, searchRuns } from '../search/index.js'
import type { SearchQuery } from '../search/types.js'
import { WorkspaceStore } from '../workspaces/index.js'
import { detectRegression } from '../regression/index.js'
import { benchmarkCompare, benchmarkRunAgainstAverage } from '../benchmark/index.js'
import { randomUUID } from 'node:crypto'
import { PluginRuntime, listPlugins, enablePlugin, disablePlugin, getPluginManifest, loadPlugin } from '../plugins/index.js'
import type { ContextSievePlugin } from '../plugins/sdk/types.js'
import type { ProviderRegistry } from '../providers/registry.js'
import { MultiRunRunner, compareRuns } from '../multirun/index.js'

import type { ChatMessage } from '../types/index.js'
import { defaultConfig } from '../config/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const uiHtmlPath = join(__dirname, '..', 'ui', 'index.html')

let cachedHtml: string | null = null

function loadHtml(): string {
  if (!cachedHtml) {
    cachedHtml = readFileSync(uiHtmlPath, 'utf-8')
  }
  return cachedHtml
}

export function createUiServer(snapshotStore: SnapshotStore, replayStore?: ReplayStore, annotationStore?: AnnotationStore, searchIndex?: SearchIndex, workspaceStore?: WorkspaceStore, pluginRuntime?: PluginRuntime, providerRegistry?: ProviderRegistry): Hono {
  const rs = replayStore ?? new ReplayStore()
  const ann = annotationStore ?? new AnnotationStore()
  const ws = workspaceStore ?? new WorkspaceStore()
  const runtime = pluginRuntime ?? new PluginRuntime()
  const ui = new Hono()

  ui.get('/ui', c => {
    const html = loadHtml()
    return c.html(html)
  })

  ui.get('/api/runs', c => {
    const runs = snapshotStore.listSnapshots(50)
    return c.json(runs)
  })

  ui.get('/api/run/:id', c => {
    const id = c.req.param('id')
    const snapshot = snapshotStore.getSnapshotById(id)
    if (!snapshot) {
      return c.json({ error: 'Snapshot not found' }, 404)
    }
    return c.json(snapshot)
  })

  ui.get('/api/timeline/diff', c => {
    const runA = c.req.query('runA')
    const runB = c.req.query('runB')
    if (!runA || !runB) {
      return c.json({ error: 'Query params runA and runB required' }, 400)
    }
    const timelineA = getTimeline(runA, snapshotStore)
    const timelineB = getTimeline(runB, snapshotStore)
    if (!timelineA || !timelineB) {
      return c.json({ error: 'Snapshot not found' }, 404)
    }
    return c.json(diffTimelines(timelineA, timelineB))
  })

  ui.get('/api/timeline/:id', c => {
    const id = c.req.param('id')
    if (id === 'diff') return c.redirect('/api/timeline/diff?' + c.req.query().toString())
    const timeline = getTimeline(id, snapshotStore)
    if (!timeline) {
      return c.json({ error: 'Snapshot not found' }, 404)
    }
    return c.json(timeline)
  })

  ui.get('/api/replays', c => {
    const replays = rs.listReplays()
    return c.json(replays)
  })

  ui.post('/api/replay/export/:runId', c => {
    const runId = c.req.param('runId')
    const compareRunId = c.req.query('compare')
    try {
      const artifact = exportReplay(runId, snapshotStore, compareRunId || undefined)
      rs.saveReplay(artifact)
      return c.json({
        replayId: artifact.id,
        url: `/ui/replay/${artifact.id}`,
      })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 404)
    }
  })

  ui.get('/api/replay/:id', c => {
    const id = c.req.param('id')
    const artifact = rs.loadReplay(id)
    if (!artifact) {
      return c.json({ error: 'Replay not found' }, 404)
    }
    return c.json(artifact)
  })

  ui.get('/ui/replay/:replayId', c => {
    const replayId = c.req.param('replayId')
    const artifact = rs.loadReplay(replayId)
    if (!artifact) {
      return c.notFound()
    }
    const html = loadHtml()
    return c.html(html)
  })

  const CreateAnnotationSchema = z.object({
    runId: z.string().min(1),
    frameIndex: z.number().int().min(0),
    stage: z.string().optional(),
    author: z.string().min(1),
    type: z.enum(['note', 'question', 'issue', 'insight', 'decision']),
    content: z.string().min(1),
  })

  ui.post('/api/annotations', async c => {
    const body = await c.req.json()
    const parsed = CreateAnnotationSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid annotation', details: parsed.error.issues }, 400)
    }
    const annotation = {
      id: randomUUID(),
      runId: parsed.data.runId,
      frameIndex: parsed.data.frameIndex,
      stage: parsed.data.stage,
      author: parsed.data.author,
      type: parsed.data.type,
      content: parsed.data.content,
      createdAt: Date.now(),
    }
    ann.createAnnotation(annotation)
    return c.json(annotation, 201)
  })

  ui.get('/api/annotations', c => {
    const runId = c.req.query('runId')
    const frameIndex = c.req.query('frameIndex')
    if (runId && frameIndex !== undefined) {
      return c.json(ann.getAnnotationsForFrame(runId, Number(frameIndex)))
    }
    if (runId) {
      return c.json(ann.getAnnotations(runId))
    }
    return c.json(ann.listAnnotations())
  })

  ui.get('/api/search', c => {
    if (!searchIndex) {
      return c.json({ error: 'Search index not available' }, 503)
    }
    const query: SearchQuery = {}
    const text = c.req.query('text')
    if (text) query.text = text
    const runId = c.req.query('runId')
    if (runId) query.runId = runId
    const author = c.req.query('author')
    if (author) query.author = author
    const annotationType = c.req.query('annotationType')
    if (annotationType) query.annotationType = annotationType as SearchQuery['annotationType']
    const stage = c.req.query('stage')
    if (stage) query.stage = stage
    const hasSummary = c.req.query('hasSummary')
    if (hasSummary === 'true') query.hasSummary = true
    const hasDiff = c.req.query('hasDiff')
    if (hasDiff === 'true') query.hasDiff = true
    const hasCausal = c.req.query('hasCausal')
    if (hasCausal === 'true') query.hasCausal = true
    const minConfidence = c.req.query('minConfidence')
    if (minConfidence) query.minConfidence = Number(minConfidence)
    return c.json(searchRuns(searchIndex, query))
  })

  ui.post('/api/regression', async c => {
    const body = await c.req.json()
    const baselineRunIds: string[] = body.baselineRunIds ?? []
    const candidateRunIds: string[] = body.candidateRunIds ?? []
    if (baselineRunIds.length === 0 || candidateRunIds.length === 0) {
      return c.json({ error: 'baselineRunIds and candidateRunIds required' }, 400)
    }
    const report = detectRegression(baselineRunIds, candidateRunIds, snapshotStore)
    return c.json(report)
  })

  ui.post('/api/benchmark', async c => {
    const body = await c.req.json()
    if (body.originalRunId && body.optimizedRunId) {
      try {
        const report = benchmarkCompare(body.originalRunId, body.optimizedRunId, snapshotStore)
        return c.json(report)
      } catch (err) {
        return c.json({ error: (err as Error).message }, 404)
      }
    }
    if (body.runId) {
      const report = benchmarkRunAgainstAverage(body.runId, snapshotStore)
      if (!report) return c.json({ error: 'Not enough runs to benchmark against' }, 400)
      return c.json(report)
    }
    return c.json({ error: 'Provide originalRunId+optimizedRunId or runId' }, 400)
  })

  ui.get('/api/workspaces', c => {
    return c.json(ws.listWorkspaces())
  })

  ui.post('/api/workspaces', async c => {
    const body = await c.req.json()
    if (!body.name) return c.json({ error: 'name required' }, 400)
    const workspace = ws.createWorkspace({ name: body.name })
    return c.json(workspace, 201)
  })

  ui.get('/api/workspace/:id', c => {
    const id = c.req.param('id')
    const workspace = ws.getWorkspace(id)
    if (!workspace) return c.json({ error: 'Workspace not found' }, 404)
    return c.json(workspace)
  })

  ui.post('/api/workspace/:id/runs', async c => {
    const id = c.req.param('id')
    const body = await c.req.json()
    if (!body.runId) return c.json({ error: 'runId required' }, 400)
    const updated = ws.addRunToWorkspace(id, body.runId)
    if (!updated) return c.json({ error: 'Workspace not found' }, 404)
    return c.json(updated)
  })

  ui.post('/api/workspace/:id/replays', async c => {
    const id = c.req.param('id')
    const body = await c.req.json()
    if (!body.replayId) return c.json({ error: 'replayId required' }, 400)
    const updated = ws.addReplayToWorkspace(id, body.replayId)
    if (!updated) return c.json({ error: 'Workspace not found' }, 404)
    return c.json(updated)
  })

  // --- Plugin endpoints ---

  ui.get('/api/plugins', c => {
    const manifests = listPlugins()
    const plugins = manifests.map(m => {
      const p = runtime.getPlugin(m.id)
      return {
        manifest: m,
        loaded: !!p,
        extensionTypes: getPluginExtensionTypes(p),
        runtimeStatus: p ? (runtime.isEnabled(m.id) ? 'enabled' : 'disabled') : 'unloaded',
      }
    })
    return c.json(plugins)
  })

  ui.post('/api/plugins/register', async c => {
    const body = await c.req.json()
    if (!body.id || !body.path) return c.json({ error: 'id and path required' }, 400)
    try {
      const plugin = await loadPlugin(body.id)
      runtime.register(plugin)
      const manifest = await import('../plugins/registry.js').then(m => m.registerPlugin(body.id, plugin))
      return c.json({ manifest, loaded: true }, 201)
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400)
    }
  })

  ui.post('/api/plugins/load/:id', async c => {
    const id = c.req.param('id')
    try {
      const manifest = getPluginManifest(id)
      if (!manifest) return c.json({ error: 'Plugin not found in registry' }, 404)
      const plugin = await loadPlugin(id)
      runtime.register(plugin)
      return c.json({ id, loaded: true })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400)
    }
  })

  ui.post('/api/plugins/enable/:id', async c => {
    const id = c.req.param('id')
    try {
      const plugin = runtime.getPlugin(id)
      if (!plugin) {
        const manifest = getPluginManifest(id)
        if (!manifest) return c.json({ error: 'Plugin not found' }, 404)
        const loaded = await loadPlugin(id)
        runtime.register(loaded)
      }
      runtime.enable(id)
      enablePlugin(id)
      const wsList = ws.listWorkspaces()
      for (const workspace of wsList) {
        if (!workspace.plugins.includes(id)) {
          ws.addPluginToWorkspace(workspace.id, id)
        }
      }
      return c.json({ id, enabled: true })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400)
    }
  })

  ui.post('/api/plugins/disable/:id', async c => {
    const id = c.req.param('id')
    runtime.disable(id)
    disablePlugin(id)
    return c.json({ id, enabled: false })
  })

  ui.get('/api/plugins/:id', c => {
    const id = c.req.param('id')
    const plugin = runtime.getPlugin(id)
    const manifest = getPluginManifest(id)
    if (!plugin && !manifest) return c.json({ error: 'Plugin not found' }, 404)
    return c.json({
      plugin: plugin ?? null,
      manifest: manifest ?? null,
      loaded: !!plugin,
      enabled: plugin ? runtime.isEnabled(id) : false,
      extensionTypes: getPluginExtensionTypes(plugin ?? undefined),
    })
  })

  // --- Multi-Provider Run API ---

  ui.post('/api/multirun', async c => {
    const body = await c.req.json()
    const providers = body.providers as string[] | undefined
    const model = body.model as string ?? 'gpt-4o-mini'
    const messages = body.messages as Array<{ role: string; content: string }> ?? []
    if (!providers || providers.length < 2) {
      return c.json({ error: 'At least 2 providers required' }, 400)
    }
    if (messages.length === 0) {
      return c.json({ error: 'At least 1 message required' }, 400)
    }
    if (!providerRegistry) {
      return c.json({ error: 'Provider registry not available' }, 503)
    }
    const runner = new MultiRunRunner(providerRegistry, defaultConfig())
    try {
      const result = await runner.runAcrossProviders(
        { model, messages: messages as ChatMessage[], stream: false },
        providers,
      )
      // Save snapshots to store
      for (const snap of result.runs) {
        try { snapshotStore.saveSnapshot(snap) } catch {}
      }
      return c.json(result)
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500)
    }
  })

  ui.post('/api/multirun/compare', async c => {
    const body = await c.req.json()
    const runIds = body.runIds as string[] | undefined
    if (!runIds || runIds.length < 2) {
      return c.json({ error: 'At least 2 runIds required' }, 400)
    }
    const runs = runIds.map(id => snapshotStore.getSnapshotById(id)).filter(Boolean)
    if (runs.length < 2) {
      return c.json({ error: 'Not enough snapshots found' }, 404)
    }
    const comparison = compareRuns(runs as any[])
    return c.json({ runs: runs.map(r => ({ id: r!.id, provider: r!.provider })), comparison })
  })

  ui.get('/api/multirun/group/:groupId', c => {
    const groupId = c.req.param('groupId')
    const allSnapshots = snapshotStore.listSnapshots(200)
    const groupRuns = allSnapshots.filter(
      (s: any) => s.multiRun?.groupId === groupId,
    )
    if (groupRuns.length === 0) {
      return c.json({ error: 'Group not found' }, 404)
    }
    const fullRuns = groupRuns.map((s: any) => snapshotStore.getSnapshotById(s.id)).filter(Boolean)
    const comparison = compareRuns(fullRuns as any[])
    return c.json({ groupId, runs: fullRuns, comparison })
  })

  ui.get('/ui/multirun/:groupId', c => {
    const html = loadHtml()
    return c.html(html)
  })

  // --- Testing API ---

  ui.get('/api/test/run', async c => {
    const suite = c.req.query('suite') ?? 'all'
    const { execSync } = await import('node:child_process')
    try {
      let output = ''
      let coverage = ''
      if (suite === 'unit') {
        output = execSync('pnpm vitest run tests/unit --reporter=verbose 2>&1', { encoding: 'utf-8', cwd: process.cwd() })
      } else if (suite === 'golden') {
        output = execSync('pnpm vitest run tests/golden --reporter=verbose 2>&1', { encoding: 'utf-8', cwd: process.cwd() })
      } else if (suite === 'integration') {
        output = execSync('pnpm vitest run tests/integration --reporter=verbose 2>&1', { encoding: 'utf-8', cwd: process.cwd() })
      } else {
        output = execSync('pnpm vitest run --reporter=verbose 2>&1', { encoding: 'utf-8', cwd: process.cwd() })
        try {
          coverage = execSync('pnpm vitest run --coverage --reporter=verbose 2>&1', { encoding: 'utf-8', cwd: process.cwd(), timeout: 60000 })
        } catch {}
      }
      return c.json({ output, coverage })
    } catch (err) {
      return c.json({ error: (err as Error).message, output: (err as any).stdout ?? '' })
    }
  })

  // --- Providers API ---

  if (providerRegistry) {
    ui.get('/api/providers', c => {
      return c.json({
        providers: providerRegistry.listProviders(),
        routes: providerRegistry.getRoutes(),
        defaultProvider: providerRegistry.defaultProvider,
      })
    })

    ui.get('/api/providers/test', async c => {
      const id = c.req.query('id')
      if (!id) return c.json({ error: 'Provider id required' }, 400)
      const provider = providerRegistry.getProvider(id)
      if (!provider) return c.json({ error: 'Provider not found' }, 404)
      try {
        const start = Date.now()
        const response = await provider.chat({
          model: c.req.query('model') ?? 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Respond with "OK" only.' }],
        })
        const elapsed = Date.now() - start
        return c.json({ reachable: true, latencyMs: elapsed, content: response.content.slice(0, 100) })
      } catch (err) {
        return c.json({ reachable: false, error: (err as Error).message })
      }
    })
  }

  return ui
}

function getPluginExtensionTypes(plugin: ContextSievePlugin | undefined): string[] {
  if (!plugin) return []
  const types: string[] = []
  if (plugin.stages && plugin.stages.length > 0) types.push('stage')
  if (plugin.analyzers && plugin.analyzers.length > 0) types.push('analyzer')
  if (plugin.replay && plugin.replay.length > 0) types.push('replay')
  if (plugin.dashboard && plugin.dashboard.length > 0) types.push('dashboard')
  if (plugin.search && plugin.search.length > 0) types.push('search')
  return types
}
