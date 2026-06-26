# Build a Token Heatmap Plugin in 15 Minutes

This tutorial creates a `token-heatmap` plugin that visualizes the most frequent tokens in pipeline requests.

## Step 1: Create the Plugin Scaffold

```bash
context-sieve plugin create token-heatmap
```

This generates:

```
plugins/token-heatmap/
 ├── plugin.ts
 ├── stage.ts
 ├── analyzer.ts
 └── README.md
```

## Step 2: Define the Pipeline Stage

Edit `plugins/token-heatmap/stage.ts` to count word frequencies from the request:

```ts
import type { PluginStage } from 'context-sieve/dist/plugins/sdk/types.js'

export const tokenHeatmapStage: PluginStage = {
  name: 'token-heatmap',
  position: 'after',
  relativeTo: 'measure',
  async run(ctx) {
    const text = ctx.request.messages.map(m => m.content).join(' ')
    const tokens = text.split(/\s+/)
    const heatmap: Record<string, number> = {}
    for (const t of tokens) {
      const key = t.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (key.length > 0) {
        heatmap[key] = (heatmap[key] || 0) + 1
      }
    }
    const topTokens = Object.entries(heatmap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([token, count]) => ({ token, count }))

    return {
      stage: 'token-heatmap',
      status: 'ok',
      meta: {
        uniqueTokens: Object.keys(heatmap).length,
        totalWords: tokens.length,
        topTokens,
      },
    }
  },
}
```

## Step 3: Add a Decision Analyzer

Edit `plugins/token-heatmap/analyzer.ts`:

```ts
import type { PluginAnalyzer } from 'context-sieve/dist/plugins/sdk/types.js'

export const tokenHeatmapAnalyzer: PluginAnalyzer = {
  name: 'token-heatmap-analyzer',
  run(ctx) {
    const msgCount = ctx.request.messages.length
    const roleCounts: Record<string, number> = {}
    for (const m of ctx.request.messages) {
      roleCounts[m.role] = (roleCounts[m.role] || 0) + 1
    }
    return {
      heatmapMsgCount: msgCount,
      heatmapRoleBreakdown: roleCounts,
    }
  },
}
```

## Step 4: Wire the Plugin

Edit `plugins/token-heatmap/plugin.ts`:

```ts
import type { ContextSievePlugin } from 'context-sieve/dist/plugins/sdk/types.js'
import { tokenHeatmapStage } from './stage.js'
import { tokenHeatmapAnalyzer } from './analyzer.js'

const plugin: ContextSievePlugin = {
  id: 'token-heatmap',
  version: '0.1.0',
  stages: [tokenHeatmapStage],
  analyzers: [tokenHeatmapAnalyzer],
}

export default plugin
```

## Step 5: Install and Enable

```bash
# Register the plugin
context-sieve plugin enable token-heatmap

# Verify it's listed
context-sieve plugin list
```

Expected output:

```
Plugins (1):
  token-heatmap@0.1.0 [enabled]
```

## Step 6: Verify

Make a request through the pipeline and check the trace output for the `token-heatmap` stage.

## Next Steps

- Add a replay extension to show token heatmap data in replay artifacts
- Add a dashboard card showing average token distribution
- Publish your plugin for others to use
