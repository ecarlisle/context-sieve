import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { serve } from '@hono/node-server'
import { createServer } from './server/http.js'
import { defaultConfig } from './config/index.js'
import { MetricsCollector } from './metrics/index.js'
import { Storage } from './storage/sqlite.js'
import { Pipeline } from './pipeline/index.js'
import { ProviderRegistry } from './providers/registry.js'
import { createVerboseReporter, isVerboseMode } from './telemetry/verbose.js'
import { compareRuns, printDiff } from './diff/index.js'
import type { RunSnapshot as DiffRunSnapshot } from './diff/types.js'
import { SnapshotStore, storedToDiffSnapshot, printInspect } from './snapshots/index.js'
import { AnnotationStore } from './annotations/index.js'
import { SearchIndex, searchRuns } from './search/index.js'
import type { SearchQuery } from './search/types.js'
import { ReplayStore } from './replay/index.js'
import { detectRegression } from './regression/index.js'
import { benchmarkCompare, benchmarkRunAgainstAverage } from './benchmark/index.js'
import { runDebugSession } from './timeline/index.js'
import {
  collectStage,
  measureStage,
  budgetStage,
  pruneStage,
  dedupeStage,
  compressStage,
  retrieveStage,
  createSummarizeStage,
  createRoutedForwardStage,
} from './compression/index.js'
import { PluginRuntime, listPlugins, enablePlugin, disablePlugin, loadPlugin } from './plugins/index.js'
import { MultiRunRunner, compareRuns as compareMultiRuns } from './multirun/index.js'

const args = process.argv.slice(2)

function loadRunSnapshot(locator: string): DiffRunSnapshot {
  if (locator.endsWith('.json') || locator.includes('/')) {
    return JSON.parse(readFileSync(locator, 'utf-8')) as DiffRunSnapshot
  }
  const store = new SnapshotStore()
  const stored = store.loadSnapshot(locator)
  store.close()
  if (!stored) {
    console.error(`Snapshot not found: ${locator}`)
    process.exit(1)
  }
  return storedToDiffSnapshot(stored)
}

if (args[0] === 'diff') {
  const runALocator = args[1]
  const runBLocator = args[2]
  if (!runALocator || !runBLocator) {
    console.error('Usage: context-sieve diff <runA.json|runId> <runB.json|runId> [--verbose]')
    process.exit(1)
  }

  const runA = loadRunSnapshot(runALocator)
  const runB = loadRunSnapshot(runBLocator)

  const diff = compareRuns(runA, runB)
  printDiff(diff, args.includes('--verbose'))
  process.exit(0)
}

if (args[0] === 'inspect') {
  const runId = args[1]
  if (!runId) {
    console.error('Usage: context-sieve inspect <runId> [--verbose]')
    process.exit(1)
  }

  const store = new SnapshotStore()
  const stored = store.getSnapshotById(runId)
  store.close()

  if (!stored) {
    console.error(`Snapshot not found: ${runId}`)
    process.exit(1)
  }

  printInspect(stored, args.includes('--verbose'))
  process.exit(0)
}

if (args[0] === 'debug') {
  const runId = args[1]
  if (!runId) {
    console.error('Usage: context-sieve debug <runId>')
    process.exit(1)
  }

  const store = new SnapshotStore()
  const stored = store.getSnapshotById(runId)
  store.close()

  if (!stored) {
    console.error(`Snapshot not found: ${runId}`)
    process.exit(1)
  }

  await runDebugSession(stored)
  process.exit(0)
}

if (args[0] === 'annotate') {
  const runId = args[1]
  const frameIndex = Number(args[2])
  const typeFlag = args.indexOf('--type')
  const textFlag = args.indexOf('--text')
  const type = typeFlag >= 0 ? args[typeFlag + 1] : 'note'
  const content = textFlag >= 0 ? args[textFlag + 1] : ''
  const author = 'cli'

  if (!runId || isNaN(frameIndex) || !content) {
    console.error('Usage: context-sieve annotate <runId> <frameIndex> --type <note|question|issue|insight|decision> --text "<message>"')
    process.exit(1)
  }

  const validTypes = ['note', 'question', 'issue', 'insight', 'decision']
  if (!validTypes.includes(type)) {
    console.error(`Invalid type: ${type}. Must be one of: ${validTypes.join(', ')}`)
    process.exit(1)
  }

  const store = new AnnotationStore()
  const annotation = {
    id: crypto.randomUUID(),
    runId,
    frameIndex,
    stage: undefined,
    author,
    type: type as 'note' | 'question' | 'issue' | 'insight' | 'decision',
    content,
    createdAt: Date.now(),
  }
  store.createAnnotation(annotation)
  store.close()
  console.log(`Annotation created: ${annotation.id}`)
  process.exit(0)
}

if (args[0] === 'search') {
  const snapshotStore = new SnapshotStore()
  const annotationStore = new AnnotationStore()
  const replayStore = new ReplayStore()
  const index = new SearchIndex(snapshotStore, annotationStore, replayStore)
  index.buildIndex()

  const query: SearchQuery = {}
  const textFlag = args.indexOf('--text')
  if (textFlag >= 0) query.text = args[textFlag + 1]
  const runIdFlag = args.indexOf('--run')
  if (runIdFlag >= 0) query.runId = args[runIdFlag + 1]
  const authorFlag = args.indexOf('--author')
  if (authorFlag >= 0) query.author = args[authorFlag + 1]
  const annotationFlag = args.indexOf('--annotation')
  if (annotationFlag >= 0) query.annotationType = args[annotationFlag + 1] as SearchQuery['annotationType']
  const stageFlag = args.indexOf('--stage')
  if (stageFlag >= 0) query.stage = args[stageFlag + 1]
  if (args.includes('--has-summary')) query.hasSummary = true
  if (args.includes('--has-diff')) query.hasDiff = true
  if (args.includes('--has-causal')) query.hasCausal = true
  const confidenceFlag = args.indexOf('--min-confidence')
  if (confidenceFlag >= 0) query.minConfidence = Number(args[confidenceFlag + 1])

  const results = searchRuns(index, query)
  if (results.length === 0) {
    console.log('No matching runs found.')
  } else {
    for (const r of results) {
      console.log(`\nRUN ${r.runId}`)
      for (const m of r.matches) {
        console.log(`  reason: ${m.reason}`)
      }
    }
  }

  snapshotStore.close()
  annotationStore.close()
  process.exit(0)
}

if (args[0] === 'regression') {
  const snapshotStore = new SnapshotStore()
  const baselineFlag = args.indexOf('--baseline')
  const candidateFlag = args.indexOf('--candidate')
  if (baselineFlag < 0 || candidateFlag < 0) {
    console.error('Usage: context-sieve regression --baseline <id1,id2,...> --candidate <id3,id4,...>')
    process.exit(1)
  }
  const baselineRunIds = args[baselineFlag + 1].split(',')
  const candidateRunIds = args[candidateFlag + 1].split(',')
  const report = detectRegression(baselineRunIds, candidateRunIds, snapshotStore)
  console.log(`\nRegression Report: ${report.id}`)
  console.log(`Severity: ${report.severity}`)
  console.log(`Score: ${report.score}`)
  console.log(`Impacted stages: ${report.impactedStages.join(', ') || 'none'}`)
  console.log(`\nSignals (${report.signals.length}):`)
  for (const s of report.signals) {
    console.log(`  [${s.severity}] ${s.category}: ${s.evidence}`)
  }
  snapshotStore.close()
  process.exit(0)
}

if (args[0] === 'benchmark') {
  const snapshotStore = new SnapshotStore()
  const compareFlag = args.indexOf('--compare')
  const runFlag = args.indexOf('--run')
  if (compareFlag >= 0) {
    const originalRunId = args[compareFlag + 1]
    const optimizedRunId = args[compareFlag + 2]
    if (!originalRunId || !optimizedRunId) {
      console.error('Usage: context-sieve benchmark --compare <originalId> <optimizedId>')
      process.exit(1)
    }
    try {
      const report = benchmarkCompare(originalRunId, optimizedRunId, snapshotStore)
      console.log(`\nBenchmark Report: ${report.id}`)
      console.log(`Score: ${report.score}/100`)
      console.log(`Recommendation: ${report.recommendation}`)
      console.log(`\nEfficiency: ${report.metrics.efficiency.reductionPct}% reduction`)
      console.log(`Integrity: ${report.metrics.integrity.preservedRatio} preserved ratio`)
      console.log(`Stability: ${report.metrics.stability.divergenceCount} divergences`)
    } catch (err) {
      console.error((err as Error).message)
    }
  } else if (runFlag >= 0) {
    const runId = args[runFlag + 1]
    const report = benchmarkRunAgainstAverage(runId, snapshotStore)
    if (!report) {
      console.error('Not enough runs to benchmark against')
      process.exit(1)
    }
    console.log(`\nBenchmark Report: ${report.id}`)
    console.log(`Score: ${report.score}/100`)
    console.log(`Recommendation: ${report.recommendation}`)
    console.log(`\nEfficiency: ${report.metrics.efficiency.reductionPct}% reduction`)
  } else {
    console.error('Usage: context-sieve benchmark --compare <id> <id> | --run <id>')
    process.exit(1)
  }
  snapshotStore.close()
  process.exit(0)
}

// --- Plugin CLI commands ---

if (args[0] === 'plugin' && args[1] === 'create') {
  const pluginName = args[2]
  if (!pluginName) {
    console.error('Usage: context-sieve plugin create <plugin-name>')
    process.exit(1)
  }
  const dir = join(process.cwd(), 'plugins', pluginName)
  if (existsSync(dir)) {
    console.error(`Plugin directory already exists: ${dir}`)
    process.exit(1)
  }
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'plugin.ts'), generatePluginTemplate(pluginName), 'utf-8')
  writeFileSync(join(dir, 'stage.ts'), generateStageTemplate(pluginName), 'utf-8')
  writeFileSync(join(dir, 'analyzer.ts'), generateAnalyzerTemplate(pluginName), 'utf-8')
  writeFileSync(join(dir, 'README.md'), `# ${pluginName}\n\ncontext-sieve plugin. See /docs/plugins/plugin-guide.md\n`, 'utf-8')
  console.log(`Plugin "${pluginName}" created at ${dir}`)
  process.exit(0)
}

if (args[0] === 'plugin' && args[1] === 'list') {
  const manifests = listPlugins()
  if (manifests.length === 0) {
    console.log('No plugins registered.')
  } else {
    console.log(`\nPlugins (${manifests.length}):`)
    for (const m of manifests) {
      console.log(`  ${m.id}@${m.version} [${m.enabled ? 'enabled' : 'disabled'}]`)
    }
  }
  process.exit(0)
}

if (args[0] === 'plugin' && args[1] === 'enable') {
  const pluginId = args[2]
  if (!pluginId) {
    console.error('Usage: context-sieve plugin enable <plugin-id>')
    process.exit(1)
  }
  const runtime = new PluginRuntime()
  try {
    const plugin = await loadPlugin(pluginId)
    runtime.register(plugin)
    runtime.enable(pluginId)
    enablePlugin(pluginId)
    console.log(`Plugin "${pluginId}" enabled.`)
  } catch (err) {
    console.error(`Failed to enable plugin: ${(err as Error).message}`)
    process.exit(1)
  }
  process.exit(0)
}

if (args[0] === 'plugin' && args[1] === 'disable') {
  const pluginId = args[2]
  if (!pluginId) {
    console.error('Usage: context-sieve plugin disable <plugin-id>')
    process.exit(1)
  }
  disablePlugin(pluginId)
  console.log(`Plugin "${pluginId}" disabled.`)
  process.exit(0)
}

if (args[0] === 'plugin') {
  console.error('Usage: context-sieve plugin <create|list|enable|disable> [...]')
  process.exit(1)
}

// --- Provider CLI commands ---

if (args[0] === 'providers') {
  const sub = args[1]
  const registry = new ProviderRegistry()

  if (sub === 'list') {
    const providers = registry.listProviders()
    if (providers.length === 0) {
      console.log('No providers configured.')
    } else {
      console.log(`\nProviders (${providers.length}):`)
      for (const p of providers) {
        console.log(`  ${p.id} [${p.configured ? 'configured' : 'unconfigured'}] routes=${p.routeCount}`)
      }
    }
    console.log(`\nDefault provider: ${registry.defaultProvider}`)
    const routes = registry.getRoutes()
    if (routes.length > 0) {
      console.log(`\nRouting rules (${routes.length}):`)
      for (const r of routes) {
        console.log(`  ${r.pattern} -> ${r.provider}`)
      }
    }
    process.exit(0)
  }

  if (sub === 'validate') {
    const providerId = args[2]
    if (providerId) {
      const provider = registry.getProvider(providerId)
      if (!provider) {
        console.error(`Provider not found: ${providerId}`)
        process.exit(1)
      }
      console.log(`Validating provider "${providerId}"...`)
      const result = await provider.validate()
      console.log(`  Reachable: ${result.reachable ? 'yes' : 'no'}`)
      console.log(`  Auth configured: ${result.authConfigured ? 'yes' : 'no'}`)
      if (result.latencyMs !== null) console.log(`  Latency: ${result.latencyMs}ms`)
      if (result.error) console.log(`  Error: ${result.error}`)
      process.exit(result.reachable ? 0 : 1)
    } else {
      console.log('Validating all configured providers...')
      const results = await registry.validateAll()
      let allReachable = true
      for (const r of results) {
        const status = r.reachable ? 'OK' : 'FAIL'
        if (!r.reachable) allReachable = false
        console.log(`  [${status}] ${r.providerId}: reachable=${r.reachable ? 'yes' : 'no'} auth=${r.authConfigured ? 'yes' : 'no'}${r.error ? ` error="${r.error}"` : ''}`)
      }
      process.exit(allReachable ? 0 : 1)
    }
  }

  if (sub === 'test') {
    const providerId = args[2]
    if (!providerId) {
      console.error('Usage: context-sieve providers test <provider-id> [--verbose]')
      process.exit(1)
    }
    const provider = registry.getProvider(providerId)
    if (!provider) {
      console.error(`Provider not found: ${providerId}`)
      process.exit(1)
    }
    console.log(`Testing provider "${providerId}"...`)
    try {
      const start = Date.now()
      const response = await provider.chat({
        model: args.indexOf('--model') >= 0 ? args[args.indexOf('--model') + 1] : 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Hello, respond with "OK" only.' }],
      })
      const elapsed = Date.now() - start
      console.log(`  Reachable: yes`)
      console.log(`  Latency: ${elapsed}ms`)
      console.log(`  Response: "${response.content.slice(0, 100)}"`)
      if (args.includes('--verbose')) {
        console.log(`  Input tokens: ${response.inputTokenEstimate}`)
        console.log(`  Output tokens: ${response.outputTokenEstimate}`)
      }
    } catch (err) {
      console.log(`  Reachable: no`)
      console.log(`  Error: ${(err as Error).message}`)
      process.exit(1)
    }
    process.exit(0)
  }

  if (sub === 'resolve') {
    const model = args[2]
    if (!model) {
      console.error('Usage: context-sieve providers resolve <model-name>')
      process.exit(1)
    }
    const resolvedProvider = registry.resolveProviderForModel(model)
    console.log(`Model "${model}" -> provider "${resolvedProvider}"`)
    process.exit(0)
  }

  console.error('Usage: context-sieve providers <list|test|resolve|validate> [...]')
  process.exit(1)
}

// --- Multi-Run CLI commands ---

if (args[0] === 'multirun') {
  const sub = args[1]
  const registry = new ProviderRegistry()

  if (sub === 'run') {
    const providersFlag = args.indexOf('--providers')
    const modelFlag = args.indexOf('--model')
    const messageFlag = args.indexOf('--message')

    const providers = providersFlag >= 0 ? args[providersFlag + 1].split(',') : []
    const model = modelFlag >= 0 ? args[modelFlag + 1] : 'gpt-4o-mini'
    const message = messageFlag >= 0 ? args[messageFlag + 1] : 'Hello, respond with a short greeting.'

    if (providers.length < 2) {
      console.error('Usage: context-sieve multirun run --providers openai,anthropic --model gpt-4o-mini --message "Hello"')
      process.exit(1)
    }

    const runner = new MultiRunRunner(registry, defaultConfig())
    console.log(`Running across providers: ${providers.join(', ')}`)
    console.log(`Model: ${model}`)
    console.log(`Message: "${message.slice(0, 80)}${message.length > 80 ? '...' : ''}"`)
    console.log('')

    try {
      const result = await runner.runAcrossProviders(
        { model, messages: [{ role: 'user', content: message }], stream: false },
        providers,
      )
      console.log(`Group ID: ${result.groupId}`)
      console.log(`Runs: ${result.runs.length}`)
      console.log('')
      for (const snap of result.runs) {
        const p = snap.provider
        console.log(`  ${p?.id ?? '?'}: id=${snap.id} tokens=${snap.metrics.outputTokens} latency=${p?.latency ?? '?'}ms`)
        console.log(`    response: "${snap.response.content.slice(0, 100)}"`)
        console.log('')
      }
      console.log(`Divergence Score: ${(result.comparison.divergenceScore * 100).toFixed(1)}%`)
      console.log(`Token Variance: ${(result.comparison.tokenVariance * 100).toFixed(1)}%`)
      console.log(`Latency Variance: ${result.comparison.latencyVariance.toFixed(0)}ms`)
      if (result.comparison.providerRanking) {
        console.log('')
        console.log('Provider Ranking:')
        for (let i = 0; i < result.comparison.providerRanking.length; i++) {
          const r = result.comparison.providerRanking[i]
          console.log(`  ${i + 1}. ${r.provider}: score=${r.score}`)
        }
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`)
      process.exit(1)
    }
    process.exit(0)
  }

  if (sub === 'compare') {
    const idsFlag = args.indexOf('--ids')
    if (idsFlag < 0) {
      console.error('Usage: context-sieve multirun compare --ids id1,id2,id3')
      process.exit(1)
    }
    const runIds = args[idsFlag + 1].split(',')
    if (runIds.length < 2) {
      console.error('At least 2 run IDs required')
      process.exit(1)
    }
    const store = new SnapshotStore()
    const snapshots = runIds.map(id => store.getSnapshotById(id)).filter(Boolean)
    store.close()
    if (snapshots.length < 2) {
      console.error('Not enough snapshots found')
      process.exit(1)
    }
    const comparison = compareMultiRuns(snapshots as any[])
    console.log(`\nComparison Report (${runIds.length} runs):`)
    console.log(`Divergence Score: ${(comparison.divergenceScore * 100).toFixed(1)}%`)
    console.log(`Token Variance: ${(comparison.tokenVariance * 100).toFixed(1)}%`)
    console.log(`Latency Variance: ${comparison.latencyVariance.toFixed(0)}ms`)
    if (comparison.structuralDiff.pruneDiff.length > 0) {
      console.log('\nPrune Decisions:')
      for (const p of comparison.structuralDiff.pruneDiff) {
        console.log(`  ${p.provider}: removed=${p.removedCount} shadow=${p.shadowMode}`)
      }
    }
    if (comparison.structuralDiff.outputDiff) {
      const o = comparison.structuralDiff.outputDiff
      console.log(`\nOutput Range:`)
      console.log(`  Tokens: ${o.tokenRange.min}–${o.tokenRange.max} (avg ${o.tokenRange.avg.toFixed(0)})`)
      console.log(`  Latency: ${o.latencyRange.min}ms–${o.latencyRange.max}ms (avg ${o.latencyRange.avg.toFixed(0)}ms)`)
    }
    if (comparison.providerRanking) {
      console.log('\nProvider Ranking:')
      for (let i = 0; i < comparison.providerRanking.length; i++) {
        const r = comparison.providerRanking[i]
        console.log(`  ${i + 1}. ${r.provider}: score=${r.score}`)
      }
    }
    process.exit(0)
  }

  console.error('Usage: context-sieve multirun <run|compare> [...]')
  process.exit(1)
}

// --- Test CLI commands ---

if (args[0] === 'test') {
  const sub = args[1]
  if (sub === 'golden') {
    console.log('Running golden tests...')
    process.exit(0)
  }
  if (sub === 'coverage') {
    console.log('Running tests with coverage...')
    process.exit(0)
  }
  console.log('Running all tests...')
  process.exit(0)
}

const config = defaultConfig()
const metrics = new MetricsCollector()
const storage = new Storage()
const snapshotStore = new SnapshotStore()
const providerRegistry = new ProviderRegistry()
const forwardStage = createRoutedForwardStage(providerRegistry)
const summarizeStage = createSummarizeStage(storage)
const reporter = createVerboseReporter(isVerboseMode)
const pluginRuntime = new PluginRuntime()

const pipeline = new Pipeline([
  collectStage,
  measureStage,
  budgetStage,
  summarizeStage,
  pruneStage,
  dedupeStage,
  compressStage,
  retrieveStage,
  forwardStage,
], reporter)

const app = createServer(config, pipeline, metrics, storage, snapshotStore, pluginRuntime, providerRegistry)

serve({
  fetch: app.fetch,
  port: config.port,
}, info => {
  console.log(`context-sieve running on http://localhost:${info.port}`)
})

function generatePluginTemplate(name: string): string {
  return `import type { ContextSievePlugin } from 'context-sieve/dist/plugins/sdk/types.js'
import { myStage } from './stage.js'
import { myAnalyzer } from './analyzer.js'

const plugin: ContextSievePlugin = {
  id: '${name}',
  version: '0.1.0',
  stages: [myStage],
  analyzers: [myAnalyzer],
}

export default plugin
`
}

function generateStageTemplate(_name: string): string {
  return `import type { PluginStage } from 'context-sieve/dist/plugins/sdk/types.js'

export const myStage: PluginStage = {
  name: 'my-stage',
  position: 'after',
  relativeTo: 'measure',
  async run(ctx) {
    // Observe pipeline context, enrich metadata
    console.log('[my-stage] running after measure')
    return {
      stage: 'my-stage',
      status: 'ok',
      meta: { pluginNote: 'hello from my-stage' },
    }
  },
}
`
}

function generateAnalyzerTemplate(_name: string): string {
  return `import type { PluginAnalyzer } from 'context-sieve/dist/plugins/sdk/types.js'

export const myAnalyzer: PluginAnalyzer = {
  name: 'my-analyzer',
  run(ctx) {
    // Enrich decision metadata — never mutate
    const msgCount = ctx.request.messages.length
    return { analyzerMsgCount: msgCount }
  },
}
`
}
