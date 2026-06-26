import type { SnapshotStore } from '../snapshots/store.js'
import { buildTimeline } from '../timeline/buildTimeline.js'
import type { Timeline } from '../timeline/types.js'

export function getTimeline(runId: string, store: SnapshotStore): Timeline | null {
  const snapshot = store.getSnapshotById(runId)
  if (!snapshot) return null
  return buildTimeline(snapshot)
}
