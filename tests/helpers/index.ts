import { writeFileSync, readFileSync } from 'node:fs'
import type { RunSnapshot } from '../../src/snapshots/types.js'

export function recordSnapshot(snapshot: RunSnapshot, path: string): void {
  writeFileSync(path, JSON.stringify(snapshot, null, 2), 'utf-8')
}

export function loadSnapshot(path: string): RunSnapshot {
  return JSON.parse(readFileSync(path, 'utf-8')) as RunSnapshot
}

export function compareSnapshot(a: RunSnapshot, b: RunSnapshot): { match: boolean; differences: string[] } {
  const differences: string[] = []

  if (a.id !== b.id) differences.push(`id: ${a.id} !== ${b.id}`)
  if (a.timestamp !== b.timestamp) differences.push(`timestamp: ${a.timestamp} !== ${b.timestamp}`)
  if (a.request.model !== b.request.model) differences.push(`request.model: ${a.request.model} !== ${b.request.model}`)
  if (a.request.messages.length !== b.request.messages.length) differences.push(`request.messages length mismatch`)
  if (a.response.id !== b.response.id) differences.push(`response.id: ${a.response.id} !== ${b.response.id}`)
  if (a.metrics.inputTokens !== b.metrics.inputTokens) differences.push(`metrics.inputTokens mismatch`)
  if (a.metrics.outputTokens !== b.metrics.outputTokens) differences.push(`metrics.outputTokens mismatch`)
  if (a.pipelineTrace.length !== b.pipelineTrace.length) differences.push(`pipelineTrace length mismatch`)

  for (let i = 0; i < Math.min(a.pipelineTrace.length, b.pipelineTrace.length); i++) {
    const ta = a.pipelineTrace[i]
    const tb = b.pipelineTrace[i]
    if (ta.stage !== tb.stage) differences.push(`pipelineTrace[${i}].stage: ${ta.stage} !== ${tb.stage}`)
    if (ta.status !== tb.status) differences.push(`pipelineTrace[${i}].status: ${ta.status} !== ${tb.status}`)
  }

  return { match: differences.length === 0, differences }
}
