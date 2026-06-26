import type { PluginAnalyzer } from '../../src/plugins/sdk/types.js'

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
