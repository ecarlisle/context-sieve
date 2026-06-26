import { emitKeypressEvents } from 'node:readline'
import { buildTimeline } from './buildTimeline.js'
import { getCurrentFrame, nextFrame, prevFrame, frameCount } from './navigator.js'
import type { RunSnapshot } from '../snapshots/types.js'
import type { Timeline } from './types.js'

function printFrame(timeline: Timeline, currentIndex: number): void {
  const frame = getCurrentFrame(timeline, currentIndex)
  const total = frameCount(timeline)
  console.clear()
  console.log(`=== FRAME ${currentIndex + 1} / ${total} ===`)
  console.log(`Stage: ${frame?.stage ?? '?'}`)
  console.log('')

  console.log('INPUT:')
  if (frame?.input && typeof frame.input === 'object' && 'messages' in (frame.input as Record<string, unknown>)) {
    const input = frame.input as { messages: Array<{ role: string; content: string }> }
    for (const msg of input.messages) {
      const preview = msg.content.length > 60 ? msg.content.slice(0, 57) + '...' : msg.content
      console.log(`  [${msg.role}] ${preview}`)
    }
  } else {
    console.log(`  ${JSON.stringify(frame?.input ?? 'null')}`)
  }
  console.log('')

  console.log('OUTPUT:')
  if (frame?.output && typeof frame.output === 'object') {
    const out = frame.output as Record<string, unknown>
    for (const [k, v] of Object.entries(out)) {
      if (k === 'removed' && Array.isArray(v) && v.length > 0) {
        console.log(`  removed (${v.length}):`)
        for (const r of v) {
          const rObj = r as { type?: string; reason?: string; content?: unknown }
          console.log(`    - [${rObj.type ?? '?'}] ${rObj.reason ?? '?'}`)
        }
      } else if (Array.isArray(v)) {
        console.log(`  ${k}: [${v.join(', ')}]`)
      } else {
        console.log(`  ${k}: ${JSON.stringify(v)}`)
      }
    }
  } else {
    console.log(`  ${JSON.stringify(frame?.output ?? 'null')}`)
  }
  console.log('')

  if (frame?.decision) {
    console.log('DECISION:')
      const d = frame.decision as unknown as Record<string, unknown>
    for (const [k, v] of Object.entries(d)) {
      if (k === 'pruneAnalysis' && v) {
        console.log('  pruneAnalysis:')
        const pa = v as Record<string, unknown>
        for (const [pk, pv] of Object.entries(pa)) {
          console.log(`    ${pk}: ${JSON.stringify(pv)}`)
        }
      } else {
        console.log(`  ${k}: ${JSON.stringify(v)}`)
      }
    }
    console.log('')
  }

  if (frame?.meta && Object.keys(frame.meta).length > 0) {
    console.log('META:')
    for (const [k, v] of Object.entries(frame.meta)) {
      console.log(`  ${k}: ${JSON.stringify(v)}`)
    }
    console.log('')
  }

  console.log('─'.repeat(30))
  console.log('n: next  p: prev  i: summary  q: quit')
}

function printSnapshotSummary(snapshot: RunSnapshot): void {
  console.clear()
  console.log('=== SNAPSHOT SUMMARY ===')
  console.log(`  runId: ${snapshot.id}`)
  console.log(`  model: ${snapshot.request.model}`)
  console.log(`  messages: ${snapshot.request.messages.length}`)
  console.log(`  inputTokens: ${snapshot.metrics.inputTokens}`)
  console.log(`  outputTokens: ${snapshot.metrics.outputTokens}`)
  console.log(`  delta: ${snapshot.metrics.delta}`)
  console.log(`  stages: ${snapshot.pipelineTrace.length}`)

  if (snapshot.prune) {
    console.log('')
    console.log('  PRUNE:')
    console.log(`    shadowMode: ${snapshot.prune.shadowMode}`)
    console.log(`    removable: ${snapshot.prune.removable}`)
    console.log(`    removed: ${snapshot.prune.removed.length}`)
  }

  if (snapshot.summaries) {
    console.log('')
    console.log('  SUMMARIES:')
    console.log(`    confidence: ${snapshot.summaries.confidence}`)
    console.log(`    keyPoints: ${snapshot.summaries.keyPoints.length}`)
  }

  if (snapshot.advisory) {
    console.log('')
    console.log('  ADVISORY:')
    console.log(`    scoredCount: ${snapshot.advisory.scoredCount}`)
  }

  console.log('')
  console.log('─'.repeat(30))
  console.log('Press any key to return to debug view...')
}

export async function runDebugSession(snapshot: RunSnapshot): Promise<void> {
  const timeline = buildTimeline(snapshot)
  let currentIndex = 0

  if (!process.stdin.isTTY) {
    printFrame(timeline, currentIndex)
    return
  }

  emitKeypressEvents(process.stdin)
  process.stdin.setRawMode(true)

  process.stdin.on('keypress', (_str: string, key: { name?: string; ctrl?: boolean }) => {
    if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
      if (process.stdin.isTTY) process.stdin.setRawMode(false)
      process.stdin.pause()
      process.exit(0)
    }

    if (key.name === 'n') {
      const next = nextFrame(timeline, currentIndex)
      if (next) currentIndex++
      printFrame(timeline, currentIndex)
    } else if (key.name === 'p') {
      const prev = prevFrame(timeline, currentIndex)
      if (prev) currentIndex--
      printFrame(timeline, currentIndex)
    } else if (key.name === 'i') {
      printSnapshotSummary(snapshot)
    } else {
      printFrame(timeline, currentIndex)
    }
  })

  printFrame(timeline, currentIndex)

  await new Promise<void>(() => {})
}
