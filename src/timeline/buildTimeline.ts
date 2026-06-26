import type { RunSnapshot } from '../snapshots/types.js'
import type { Timeline, TimelineFrame } from './types.js'

export function buildTimeline(snapshot: RunSnapshot): Timeline {
  const frames: TimelineFrame[] = snapshot.pipelineTrace.map((entry, index) => {
    const frame: TimelineFrame = {
      runId: snapshot.id,
      stage: entry.stage,
      index,
      input: null,
      output: { status: entry.status },
      decision: entry.decision,
      meta: entry.meta ?? {},
    }

    if (index === 0) {
      frame.input = { messages: snapshot.request.messages }
    }

    if (entry.stage === 'collect') {
      frame.input = { messages: snapshot.request.messages }
    }

    if (entry.stage === 'measure' && entry.meta?.tokens !== undefined) {
      frame.output = { status: entry.status, tokens: entry.meta.tokens }
    }

    if (entry.stage === 'summarize' && snapshot.summaries) {
      frame.output = {
        status: entry.status,
        summaryId: snapshot.summaries.id,
        keyPoints: snapshot.summaries.keyPoints,
        confidence: snapshot.summaries.confidence,
      }
    }

    if (entry.stage === 'prune' && snapshot.prune) {
      frame.output = {
        status: entry.status,
        removed: snapshot.prune.removed,
        shadowMode: snapshot.prune.shadowMode,
        removable: snapshot.prune.removable,
        advisoryInfluenceUsed: snapshot.prune.advisoryInfluenceUsed,
      }
      frame.meta = {
        ...frame.meta,
        removedCount: snapshot.prune.removed.length,
        shadowMode: snapshot.prune.shadowMode,
        removable: snapshot.prune.removable,
      }
    }

    return frame
  })

  return {
    runId: snapshot.id,
    frames,
  }
}
