import type { ContextSievePlugin } from '../../src/plugins/sdk/types.js'
import { tokenHeatmapStage } from './stage.js'
import { tokenHeatmapAnalyzer } from './analyzer.js'
import { tokenHeatmapReplay } from './replay.js'
import { tokenHeatmapDashboard } from './dashboard.js'

const plugin: ContextSievePlugin = {
  id: 'token-heatmap',
  version: '0.1.0',
  stages: [tokenHeatmapStage],
  analyzers: [tokenHeatmapAnalyzer],
  replay: [tokenHeatmapReplay],
  dashboard: [tokenHeatmapDashboard],
}

export default plugin
