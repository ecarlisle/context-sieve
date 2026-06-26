import type { ReplayExtension } from '../../src/plugins/sdk/types.js'

export const tokenHeatmapReplay: ReplayExtension = {
  name: 'token-heatmap-replay',
  render(snapshot) {
    const stages = snapshot.pipelineTrace || []
    const tokenUsage = stages.map(s => ({
      stage: s.stage,
      meta: s.meta || {},
    }))
    return {
      tokenHeatmap: {
        stages: tokenUsage,
        totalStages: stages.length,
        enrichedAt: Date.now(),
      },
    }
  },
}
