import type { RunSnapshot, ContextDiff, MessageRef } from './types.js'
import { normalizeMessage, normalizeMessages, simpleHash } from './normalize.js'

export function compareRuns(runA: RunSnapshot, runB: RunSnapshot): ContextDiff {
  const finalB = normalizeMessages(runB.finalMessages)
  const finalBKeys = new Set(finalB.map(m => `${m.role}::${m.contentHash}`))

  const inputA = normalizeMessages(runA.inputMessages)

  const pruneRemovedHashes = new Map<string, string>()
  for (const run of [runA, runB]) {
    for (const item of run.pruneResult?.removed ?? []) {
      const content = typeof item.content === 'string' ? item.content : ''
      if (content) pruneRemovedHashes.set(simpleHash(content), item.reason)
    }
  }

  const preserved: MessageRef[] = []
  const removed: MessageRef[] = []

  for (const msg of inputA) {
    const key = `${msg.role}::${msg.contentHash}`
    const inFinalB = finalBKeys.has(key)
    const inPruneRemoved = pruneRemovedHashes.has(msg.contentHash)

    if (inFinalB && !inPruneRemoved) {
      preserved.push(msg)
    } else {
      removed.push(msg)
    }
  }

  const summarizedIds = new Set([
    ...(runA.shadowSummary?.sourceIds ?? []),
    ...(runB.shadowSummary?.sourceIds ?? []),
  ])
  const summarized = runA.inputMessages
    .filter((_, i) => summarizedIds.has(`msg-${i}`))
    .map(m => normalizeMessage(m))

  const advisoryIndices = new Set([
    ...(runA.pruneResult?.advisoryScores ?? []).map(s => s.messageIndex),
    ...(runB.pruneResult?.advisoryScores ?? []).map(s => s.messageIndex),
  ])

  const removedContentHashes = new Set<string>()
  for (const run of [runA, runB]) {
    for (const item of run.pruneResult?.removed ?? []) {
      const content = typeof item.content === 'string' ? item.content : ''
      if (content) removedContentHashes.add(simpleHash(content))
    }
  }

  const advisoryOnly = runA.inputMessages
    .filter((_, i) => {
      if (!advisoryIndices.has(i)) return false
      const hash = simpleHash(runA.inputMessages[i].content)
      return !removedContentHashes.has(hash)
    })
    .map((m, i) => normalizeMessage(m, advisoryIndices.has(i) ? i : undefined))

  const inputB = normalizeMessages(runB.inputMessages)
  const unchanged = inputA.filter((m, i) => {
    if (m.role !== 'system') return false
    const inB = inputB[i]
    return inB && inB.role === 'system' && inB.contentHash === m.contentHash
  })

  return {
    runA: structuredClone(runA),
    runB: structuredClone(runB),
    preserved,
    removed,
    summarized,
    unchanged,
    advisoryOnly,
  }
}
