import type { StageDecision, PipelineContext } from './types.js'

export function analyzeStage(
  _stageName: string,
  _input: unknown,
  ctx: PipelineContext,
): StageDecision {
  const totalChars = ctx.request.messages.reduce((s, m) => s + m.content.length, 0)
  const messageCount = ctx.request.messages.length

  switch (_stageName) {
    case 'collect':
      return { eligible: true, intent: 'collect', confidence: 1.0 }
    case 'measure':
      return { eligible: true, intent: 'measure', confidence: 1.0 }
    case 'budget': {
      const budgetConfidence = totalChars > 100 ? 0.95 : 0.5
      return { eligible: true, intent: 'budget', confidence: round2(budgetConfidence) }
    }
    case 'prune': {
      const msgFactor = Math.min(messageCount / 10, 1) * 0.5
      const sizeFactor = Math.min(totalChars / 2000, 1) * 0.5
      const pruneConfidence = msgFactor + sizeFactor
      const systemCount = ctx.request.messages.filter(m => m.role === 'system').length
      const candidates = messageCount - systemCount
      const removable = Math.max(0, Math.floor(candidates * pruneConfidence))
      return {
        eligible: pruneConfidence > 0.1,
        intent: 'prune',
        confidence: round2(pruneConfidence),
        pruneAnalysis: {
          candidates,
          removable,
          confidence: round2(pruneConfidence),
        },
      }
    }
    case 'summarize': {
      const summarizeConfidence = Math.min(totalChars / 2000, 0.9)
      return {
        eligible: summarizeConfidence > 0.1,
        intent: 'summarize',
        confidence: round2(summarizeConfidence),
      }
    }
    case 'dedupe': {
      const dedupeConfidence =
        messageCount >= 5 ? 0.7 : messageCount >= 3 ? 0.4 : messageCount >= 2 ? 0.15 : 0
      return {
        eligible: dedupeConfidence > 0.1,
        intent: 'dedupe',
        confidence: round2(dedupeConfidence),
      }
    }
    case 'compress': {
      const compressConfidence = Math.min(totalChars / 4000, 0.9)
      return {
        eligible: compressConfidence > 0.1,
        intent: 'compress',
        confidence: round2(compressConfidence),
      }
    }
    case 'retrieve':
      return { eligible: false, intent: 'retrieve', confidence: 0 }
    case 'forward':
      return { eligible: true, intent: 'forward', confidence: 1.0 }
    default:
      return { eligible: false, intent: 'collect', confidence: 0 }
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
