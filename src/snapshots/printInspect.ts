import type { RunSnapshot } from './types.js'

export function printInspect(snapshot: RunSnapshot, verbose: boolean): void {
  console.log('\n=== REQUEST ===')
  console.log(`  model: ${snapshot.request.model}`)
  for (let i = 0; i < snapshot.request.messages.length; i++) {
    const m = snapshot.request.messages[i]
    const preview = m.content.length > 80 ? m.content.slice(0, 77) + '...' : m.content
    console.log(`  [${i}] ${m.role}: ${preview}`)
  }

  console.log('\n=== RESPONSE ===')
  console.log(`  id: ${snapshot.response.id}`)
  const preview = snapshot.response.content.length > 120
    ? snapshot.response.content.slice(0, 117) + '...'
    : snapshot.response.content
  console.log(`  content: ${preview}`)

  console.log('\n=== METRICS ===')
  console.log(`  inputTokens: ${snapshot.metrics.inputTokens}`)
  console.log(`  outputTokens: ${snapshot.metrics.outputTokens}`)
  console.log(`  delta: ${snapshot.metrics.delta}`)

  console.log('\n=== PIPELINE TRACE ===')
  for (const entry of snapshot.pipelineTrace) {
    const metaStr = entry.meta ? ` ${JSON.stringify(entry.meta)}` : ''
    console.log(`  ${entry.stage} → ${entry.status}${metaStr}`)
  }

  if (snapshot.prune) {
    console.log('\n=== PRUNE REPORT ===')
    console.log(`  shadowMode: ${snapshot.prune.shadowMode}`)
    console.log(`  removable: ${snapshot.prune.removable}`)
    if (snapshot.prune.removed.length > 0) {
      console.log('  removed:')
      for (const r of snapshot.prune.removed) {
        const preview2 = typeof r.content === 'string' && r.content.length > 80
          ? (r.content as string).slice(0, 77) + '...'
          : r.content
        console.log(`    - [${r.type}] ${r.reason}`)
        console.log(`      content: ${preview2}`)
      }
    } else {
      console.log('  removed: none')
    }
    if (snapshot.prune.advisoryInfluenceUsed) {
      console.log(`  advisoryInfluenceUsed: ${snapshot.prune.advisoryInfluenceUsed}`)
    }
    if (snapshot.prune.highestAdvisoryScore !== undefined) {
      console.log(`  highestAdvisoryScore: ${snapshot.prune.highestAdvisoryScore}`)
    }
  }

  if (snapshot.summaries) {
    console.log('\n=== SHADOW SUMMARIES ===')
    console.log(`  id: ${snapshot.summaries.id}`)
    console.log(`  confidence: ${snapshot.summaries.confidence.toFixed(2)}`)
    console.log(`  sourceCount: ${snapshot.summaries.sourceCount}`)
    if (snapshot.summaries.keyPoints.length > 0) {
      console.log('  keyPoints:')
      for (const kp of snapshot.summaries.keyPoints) {
        const preview3 = kp.length > 80 ? kp.slice(0, 77) + '...' : kp
        console.log(`    - ${preview3}`)
      }
    }
  }

  if (snapshot.advisory) {
    console.log('\n=== ADVISORY SIGNALS ===')
    console.log(`  highestScore: ${snapshot.advisory.highestScore ?? 'N/A'}`)
    console.log(`  scoredCount: ${snapshot.advisory.scoredCount}`)
    if (snapshot.advisory.scores.length > 0) {
      console.log('  scores:')
      for (const s of snapshot.advisory.scores) {
        console.log(`    - msg-${s.messageIndex}: ${s.score.toFixed(2)} (${s.reason.slice(0, 60)})`)
      }
    }
  }

  if (verbose) {
    console.log('\n=== RAW SNAPSHOT ===')
    console.log(JSON.stringify(snapshot, null, 2))
  }
}
