import type { ChatMessage } from '../types/index.js'
import type { PipelineStage, PipelineContext, StageResult } from '../pipeline/types.js'
import type { Storage } from '../storage/sqlite.js'

export interface ShadowSummary {
  id: string
  sourceIds: string[]
  summary: string
  keyPoints: string[]
  confidence: number
}

const DECISION_PATTERNS = /\b(should|will|let's|going to|plan to|decided|propose|suggest|recommend|agree|choose|opt for)\b/i
const CONSTRAINT_PATTERNS = /\b(must|cannot|can't|should not|shouldn't|only if|required|need to|necessary|forbidden|prohibited|must not)\b/i
const FACT_PATTERNS = /\b(is|are|was|were|has|have|become|refers|represents|defined|means|consists|contains|includes)\b/i

function extractKeyPoints(content: string): string[] {
  const sentences = content.match(/[^.!?\n]+[.!?\n]*/g) ?? [content]
  const points: string[] = []

  for (const raw of sentences) {
    const s = raw.trim()
    if (s.length < 3) continue

    const isFact = FACT_PATTERNS.test(s)
    const isDecision = DECISION_PATTERNS.test(s)
    const isConstraint = CONSTRAINT_PATTERNS.test(s)

    if (isFact || isDecision || isConstraint) {
      points.push(s)
    }
  }

  return points
}

function buildSummary(messages: ChatMessage[], allPoints: string[]): string {
  const parts: string[] = []

  const systemMsgs = messages.filter(m => m.role === 'system')
  if (systemMsgs.length > 0) {
    parts.push(`[Context] ${systemMsgs.map(m => m.content).join(' | ')}`)
  }

  if (allPoints.length > 0) {
    parts.push(`[Key points] ${allPoints.join(' ')}`)
  }

  return parts.join('\n')
}

function computeConfidence(messages: ChatMessage[], allPoints: string[]): number {
  if (messages.length === 0) return 0

  const totalSentences = messages.reduce((s, m) => {
    return s + (m.content.match(/[^.!?\n]+[.!?\n]*/g) ?? []).length
  }, 0)

  if (totalSentences === 0) return 0

  const ratio = allPoints.length / totalSentences
  return Math.round(Math.min(ratio * 1.5, 1) * 100) / 100
}

function generateShadowSummary(messages: ChatMessage[]): ShadowSummary {
  const allPoints: string[] = []
  const sourceIds: string[] = []

  for (let i = 0; i < messages.length; i++) {
    const id = `msg-${i}`
    const points = extractKeyPoints(messages[i].content)
    if (points.length > 0) {
      sourceIds.push(id)
      allPoints.push(...points)
    }
  }

  const summary = buildSummary(messages, allPoints)
  const confidence = computeConfidence(messages, allPoints)

  return {
    id: `sum-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sourceIds,
    summary: summary || '(no extractable content)',
    keyPoints: allPoints,
    confidence,
  }
}

export function createSummarizeStage(storage: Storage): PipelineStage {
  return {
    name: 'summarize',
    async run(ctx: PipelineContext): Promise<StageResult> {
      const summary = generateShadowSummary(ctx.request.messages)
      ctx.state.set('shadowSummary', summary)

      try {
        storage.insertSummary(summary)
      } catch {
        // Storage errors must not fail the request
      }

      return {
        stage: 'summarize',
        status: 'ok',
        meta: {
          summaryId: summary.id,
          keyPointsCount: summary.keyPoints.length,
          confidence: summary.confidence,
        },
      }
    },
  }
}
