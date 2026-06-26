import type { DashboardExtension } from '../../src/plugins/sdk/types.js'

export const tokenHeatmapDashboard: DashboardExtension = {
  name: 'token-heatmap-dashboard',
  title: 'Token Heatmap',
  render(snapshotStore) {
    const runs = snapshotStore.listSnapshots(20)
    const avgTokens = runs.length > 0
      ? Math.round(runs.reduce((sum, r) => sum + (r.metrics?.inputTokens || 0), 0) / runs.length)
      : 0
    return {
      recentRunCount: runs.length,
      averageInputTokens: avgTokens,
    }
  },
}
