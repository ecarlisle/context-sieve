import type { Timeline, TimelineFrame, TimelineDiff } from './types.js'

function outputStructure(output: unknown): string {
  if (output === null || output === undefined) return 'null'
  if (typeof output === 'object') {
    return JSON.stringify(output, Object.keys(output as Record<string, unknown>).sort())
  }
  return String(output)
}

function detectDivergence(frameA: TimelineFrame, frameB: TimelineFrame): Array<{ reason: TimelineDiff['divergencePoints'][number]['reason']; detail: string; severity: number }> {
  const points: Array<{ reason: TimelineDiff['divergencePoints'][number]['reason']; detail: string; severity: number }> = []

  const metaA = frameA.meta ?? {}
  const metaB = frameB.meta ?? {}

  if (frameA.stage === 'prune') {
    const rcA = (metaA.removedCount as number) ?? 0
    const rcB = (metaB.removedCount as number) ?? 0
    if (rcA !== rcB) {
      points.push({ reason: 'removed', detail: `removedCount: ${rcA} → ${rcB}`, severity: Math.abs(rcA - rcB) })
    }
    const smA = (metaA.shadowMode as boolean) ?? false
    const smB = (metaB.shadowMode as boolean) ?? false
    if (smA !== smB) {
      points.push({ reason: 'removed', detail: `shadowMode: ${smA} → ${smB}`, severity: 1 })
    }
  }

  if (frameA.stage === 'summarize') {
    const hasA = frameA.output && typeof frameA.output === 'object' && 'keyPoints' in (frameA.output as Record<string, unknown>)
    const hasB = frameB.output && typeof frameB.output === 'object' && 'keyPoints' in (frameB.output as Record<string, unknown>)
    if (hasA !== hasB) {
      points.push({ reason: 'summary', detail: hasA ? 'present → absent' : 'absent → present', severity: 1 })
    }
  }

  const advisoryA = metaA.highestAdvisoryScore as number | undefined
  const advisoryB = metaB.highestAdvisoryScore as number | undefined
  if (advisoryA !== undefined && advisoryB !== undefined && advisoryA !== advisoryB) {
    points.push({ reason: 'advisory', detail: `advisoryScore: ${advisoryA.toFixed(2)} → ${advisoryB.toFixed(2)}`, severity: Math.round(Math.abs(advisoryA - advisoryB) * 100) })
  } else if ((advisoryA === undefined) !== (advisoryB === undefined)) {
    points.push({ reason: 'advisory', detail: `advisory: ${advisoryA ?? 'none'} → ${advisoryB ?? 'none'}`, severity: 1 })
  }

  if (outputStructure(frameA.output) !== outputStructure(frameB.output)) {
    const alreadyReported = points.some(p => p.reason !== 'output-change')
    if (!alreadyReported) {
      points.push({ reason: 'output-change', detail: 'stage output structure differs', severity: 1 })
    }
  }

  return points
}

export function diffTimelines(a: Timeline, b: Timeline): TimelineDiff {
  const matchedFrames: TimelineDiff['matchedFrames'] = []
  const divergencePoints: TimelineDiff['divergencePoints'] = []
  const onlyInA: TimelineFrame[] = []
  const onlyInB: TimelineFrame[] = []

  const maxLen = Math.max(a.frames.length, b.frames.length)
  const bByIndex = new Map<number, TimelineFrame>()
  for (const f of b.frames) bByIndex.set(f.index, f)

  for (let i = 0; i < maxLen; i++) {
    const frameA = a.frames[i]
    const frameB = bByIndex.get(i)

    if (!frameA && frameB) {
      onlyInB.push(frameB)
      continue
    }
    if (frameA && !frameB) {
      onlyInA.push(frameA)
      continue
    }
    if (!frameA || !frameB) continue

    if (frameA.stage === frameB.stage) {
      matchedFrames.push({ stage: frameA.stage, frameA, frameB })
      const divergences = detectDivergence(frameA, frameB)
      for (const d of divergences) {
        divergencePoints.push({ stage: frameA.stage, ...d })
      }
    } else {
      onlyInA.push(frameA)
      onlyInB.push(frameB)
    }
  }

  return { runAId: a.runId, runBId: b.runId, matchedFrames, divergencePoints, onlyInA, onlyInB }
}
