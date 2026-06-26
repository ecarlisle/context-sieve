import type { ChatMessage, ChatCompletionRequest } from '../types/index.js'

export interface RemovedItem {
  type: 'redundant' | 'low-value' | 'duplicate' | 'noise'
  content: unknown
  reason: string
}

export interface SummaryHints {
  keyPoints: string[]
  sourceSummaryId: string
}

export interface AdvisoryScore {
  messageIndex: number
  advisoryScore: number
  reason: string
}

export interface PruneResult {
  original: unknown
  pruned: unknown
  removed: RemovedItem[]
  advisoryScores?: AdvisoryScore[]
  advisoryInfluenceUsed?: boolean
  highestAdvisoryScore?: number
}

function extractTaskKeywords(messages: ChatMessage[]): Set<string> {
  const systemMsg = messages.find(m => m.role === 'system')
  const firstUser = messages.find(m => m.role === 'user')
  const source = systemMsg?.content ?? firstUser?.content ?? ''
  return new Set(
    source
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 3),
  )
}

function detectExactDuplicates(
  messages: ChatMessage[],
  keep: Set<number>,
  removed: RemovedItem[],
): void {
  const seen = new Map<string, number>()

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (m.role === 'system') continue

    const key = `${m.role}::${m.content}`
    const firstIdx = seen.get(key)

    if (firstIdx !== undefined) {
      removed.push({
        type: 'duplicate',
        content: m.content,
        reason: `Exact duplicate of earlier ${m.role} message at index ${firstIdx}`,
      })
      keep.delete(i)
    } else {
      seen.set(key, i)
    }
  }
}

function detectLowSignalMessages(
  messages: ChatMessage[],
  threshold: number,
  taskKeywords: Set<string>,
  keep: Set<number>,
  removed: RemovedItem[],
): void {
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (m.role === 'system') continue
    if (!keep.has(i)) continue

    if (m.content.length < threshold) {
      const words = m.content
        .toLowerCase()
        .split(/\W+/)
        .filter(w => w.length > 3)
      const overlap = words.filter(w => taskKeywords.has(w)).length
      if (overlap === 0) {
        removed.push({
          type: 'low-value',
          content: m.content,
          reason: `Message below threshold (${m.content.length} chars) with no task keywords`,
        })
        keep.delete(i)
      }
    }
  }
}

function detectRedundantEchoes(
  messages: ChatMessage[],
  keep: Set<number>,
  removed: RemovedItem[],
): void {
  for (let i = 1; i < messages.length; i++) {
    const m = messages[i]
    if (m.role !== 'assistant') continue
    if (!keep.has(i)) continue

    const prev = messages[i - 1]
    if (prev.role === 'user') {
      const userWords = new Set(
        prev.content
          .toLowerCase()
          .split(/\W+/)
          .filter(w => w.length > 2),
      )
      const asstWords = m.content
        .toLowerCase()
        .split(/\W+/)
        .filter(w => w.length > 2)

      if (asstWords.length > 0) {
        const overlap = asstWords.filter(w => userWords.has(w)).length
        const ratio = overlap / asstWords.length
        if (ratio > 0.8) {
          removed.push({
            type: 'redundant',
            content: m.content,
            reason: `Assistant echoes prior user input (${Math.round(ratio * 100)}% overlap)`,
          })
          keep.delete(i)
        }
      }
    }
  }
}

function scorePruneCandidatesWithSummaryHints(
  messages: ChatMessage[],
  summaryHints: SummaryHints,
): AdvisoryScore[] {
  const scores: AdvisoryScore[] = []

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (m.role === 'system') continue

    let maxOverlap = 0
    let bestReason = ''

    for (const keyPoint of summaryHints.keyPoints) {
      const kpWords = new Set(
        keyPoint.toLowerCase().split(/\W+/).filter((w: string) => w.length > 3),
      )
      const msgWords = m.content
        .toLowerCase()
        .split(/\W+/)
        .filter((w: string) => w.length > 3)

      if (msgWords.length === 0) continue

      const overlap = msgWords.filter(w => kpWords.has(w)).length
      const ratio = overlap / msgWords.length

      if (ratio > maxOverlap) {
        maxOverlap = ratio
        bestReason = `overlaps with summarized key point: ${keyPoint.slice(0, 60)}`
      }
    }

    if (maxOverlap > 0) {
      scores.push({
        messageIndex: i,
        advisoryScore: Math.round(maxOverlap * 100) / 100,
        reason: bestReason,
      })
    }
  }

  return scores
}

export function shadowPrune(
  request: ChatCompletionRequest,
  threshold: number,
  summaryHints?: SummaryHints,
): PruneResult {
  const messages = request.messages
  const taskKeywords = extractTaskKeywords(messages)
  const keep = new Set<number>(messages.keys())
  const removed: RemovedItem[] = []

  detectExactDuplicates(messages, keep, removed)
  detectRedundantEchoes(messages, keep, removed)
  detectLowSignalMessages(messages, threshold, taskKeywords, keep, removed)

  const prunedMessages = messages.filter((_, i) => keep.has(i))

  let advisoryScores: AdvisoryScore[] = []
  let advisoryInfluenceUsed = false
  let highestAdvisoryScore = 0

  if (summaryHints && summaryHints.keyPoints.length > 0) {
    advisoryScores = scorePruneCandidatesWithSummaryHints(messages, summaryHints)
    highestAdvisoryScore =
      advisoryScores.length > 0
        ? Math.max(...advisoryScores.map(s => s.advisoryScore))
        : 0
    advisoryInfluenceUsed = highestAdvisoryScore > 0
  }

  return {
    original: request,
    pruned: { ...request, messages: prunedMessages },
    removed,
    advisoryScores: advisoryScores.length > 0 ? advisoryScores : undefined,
    advisoryInfluenceUsed,
    highestAdvisoryScore: advisoryInfluenceUsed ? highestAdvisoryScore : undefined,
  }
}
