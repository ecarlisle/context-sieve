import type { ContextDiff, MessageRef } from './types.js'

function printSection(label: string, items: MessageRef[], extra?: (m: MessageRef) => string): void {
  console.log(`\n${label} (${items.length})`)
  if (items.length === 0) return
  for (const m of items) {
    const suffix = extra ? ` ${extra(m)}` : ''
    const preview = m.content.length > 80 ? m.content.slice(0, 77) + '...' : m.content
    console.log(`  - ${m.role}: ${preview}${suffix}`)
  }
}

function printTrace(traceName: string, trace: { stage: string; status: string; meta?: Record<string, unknown>; decision?: { eligible: boolean; confidence: number } }[]): void {
  console.log(`\n=== ${traceName} ===`)
  for (const entry of trace) {
    const metaStr = entry.meta ? ` ${JSON.stringify(entry.meta)}` : ''
    console.log(`  ${entry.stage} → ${entry.status}${metaStr}`)
  }
}

export function printDiff(diff: ContextDiff, verbose: boolean): void {
  console.log('\n=== CONTEXT DIFF REPORT ===')

  printSection('PRESERVED', diff.preserved)
  printSection('REMOVED', diff.removed)
  printSection('SUMMARIZED', diff.summarized)

  const advisoryConfidence = (m: MessageRef): string => {
    const idx = diff.runA.inputMessages.findIndex(
      im => simpleHash(im.content) === m.contentHash,
    )
    if (idx === -1) return ''
    const score = (diff.runA.pruneResult?.advisoryScores ?? []).find(
      s => s.messageIndex === idx,
    )
    return score ? `(confidence: ${score.advisoryScore.toFixed(2)})` : ''
  }
  printSection('ADVISORY ONLY', diff.advisoryOnly, advisoryConfidence)

  printSection('UNCHANGED', diff.unchanged)

  if (verbose) {
    console.log()
    printTrace('FULL RUN A TRACE', diff.runA.trace)
    console.log()
    printTrace('FULL RUN B TRACE', diff.runB.trace)
    console.log()
    printMetrics(diff.runA, 'RUN A METRICS')
    printMetrics(diff.runB, 'RUN B METRICS')
  }
}

function getMetricsFromTrace(trace: { stage: string; meta?: Record<string, unknown> }[]): Record<string, unknown> {
  const measure = trace.find(s => s.stage === 'measure')
  const forward = trace.find(s => s.stage === 'forward')
  const summarize = trace.find(s => s.stage === 'summarize')
  return {
    inputTokens: measure?.meta?.tokens,
    outputTokens: forward?.meta?.tokens,
    summaryConfidence: summarize?.meta?.confidence,
    ...(summarize?.meta?.keyPointsCount !== undefined
      ? { keyPointsCount: summarize.meta.keyPointsCount }
      : {}),
  }
}

function printMetrics(run: { trace: { stage: string; meta?: Record<string, unknown> }[] }, label: string): void {
  console.log(`=== ${label} ===`)
  const m = getMetricsFromTrace(run.trace)
  console.log(`  ${JSON.stringify(m)}`)
}

function simpleHash(content: string): string {
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash) + content.charCodeAt(i)
    hash |= 0
  }
  return (hash >>> 0).toString(16)
}
