import type { PluginStage } from '../../src/plugins/sdk/types.js'

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
