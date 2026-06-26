import type { SnapshotStore } from '../snapshots/store.js'
import type { AnnotationStore } from '../annotations/store.js'
import type { ReplayStore } from '../replay/store.js'
import type { IndexEntry } from './types.js'

export class SearchIndex {
  readonly entries = new Map<string, IndexEntry>()

  constructor(
    private snapshotStore: SnapshotStore,
    private annotationStore: AnnotationStore,
    private replayStore: ReplayStore,
  ) {}

  buildIndex(): void {
    this.entries.clear()
    const allAnnotations = this.annotationStore.listAnnotations(10000)
    const annotationsByRun = new Map<string, typeof allAnnotations>()
    for (const a of allAnnotations) {
      const list = annotationsByRun.get(a.runId)
      if (list) list.push(a)
      else annotationsByRun.set(a.runId, [a])
    }

    const allReplays = this.replayStore.listReplays(10000)
    const replayByRun = new Map<string, (typeof allReplays)[number]>()
    for (const r of allReplays) {
      replayByRun.set(r.runId, r)
    }

    const snapshots = this.snapshotStore.listSnapshots(10000)
    for (const s of snapshots) {
      const full = this.snapshotStore.getSnapshotById(s.id)
      if (!full) continue

      const stageNames = full.pipelineTrace.map(t => t.stage)
      const hasSummary = !!full.summaries
      const hasPrune = !!full.prune
      const runAnnotations = annotationsByRun.get(s.id) ?? []

      const annotationTypes = [...new Set(runAnnotations.map(a => a.type))]
      const annotationAuthors = [...new Set(runAnnotations.map(a => a.author))]
      const annotationTexts = runAnnotations.map(a => a.content)

      const replay = replayByRun.get(s.id)
      const hasDiff = replay?.hasDiff ?? false
      const hasCausal = replay?.hasCausal ?? false

      let compressionRatio: number | undefined
      if (full.metrics.inputTokens > 0) {
        compressionRatio = Math.round((full.metrics.outputTokens / full.metrics.inputTokens) * 100) / 100
      }

      this.entries.set(s.id, {
        runId: s.id,
        model: s.model,
        inputTokens: s.inputTokens,
        outputTokens: s.outputTokens,
        timestamp: s.createdAt,
        stageNames,
        hasSummary,
        summaryConfidence: full.summaries?.confidence,
        hasPrune,
        annotationTypes,
        annotationAuthors,
        annotationTexts,
        hasDiff,
        hasCausal,
        compressionRatio,
        replayId: replay?.id,
      })
    }
  }

  // fallow-ignore-next-line unused-class-member
  refreshIndex(): void {
    this.buildIndex()
  }

  lookup(runId: string): IndexEntry | undefined {
    return this.entries.get(runId)
  }
}
