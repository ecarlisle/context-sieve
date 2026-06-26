import type { SearchIndex } from './searchIndex.js'
import type { SearchQuery, SearchResult } from './types.js'

export function searchRuns(index: SearchIndex, query: SearchQuery): SearchResult[] {
  const results: SearchResult[] = []

  const entryList = query.runId
    ? [index.lookup(query.runId)].filter((e): e is NonNullable<typeof e> => e !== undefined)
    : [...index.entries.values()]

  for (const entry of entryList) {
    const matches: SearchResult['matches'] = []

    if (query.text) {
      const t = query.text.toLowerCase()
      let matchedAnnotation = false
      for (const text of entry.annotationTexts) {
        if (text.toLowerCase().includes(t)) {
          matches.push({ source: 'annotation', reason: `annotation text matches "${query.text}"` })
          matchedAnnotation = true
          break
        }
      }
      if (!matchedAnnotation) {
        for (const stage of entry.stageNames) {
          if (stage.toLowerCase().includes(t)) {
            matches.push({ source: 'timeline', reason: `stage "${stage}" matches "${query.text}"` })
            break
          }
        }
      }
      if (entry.model.toLowerCase().includes(t)) {
        matches.push({ source: 'snapshot', reason: `model "${entry.model}" matches "${query.text}"` })
      }
    }

    if (query.annotationType) {
      if (entry.annotationTypes.includes(query.annotationType)) {
        matches.push({ source: 'annotation', reason: `${query.annotationType} annotation found` })
      }
    }

    if (query.author) {
      if (entry.annotationAuthors.includes(query.author)) {
        matches.push({ source: 'annotation', reason: `annotation by ${query.author} found` })
      }
    }

    if (query.stage) {
      if (entry.stageNames.includes(query.stage)) {
        matches.push({ source: 'timeline', reason: `stage "${query.stage}" present` })
      }
    }

    if (query.hasSummary === true && entry.hasSummary) {
      matches.push({ source: 'snapshot', reason: 'summary generated' })
    }

    if (query.hasDiff === true && entry.hasDiff) {
      matches.push({ source: 'causal', reason: 'diff comparison available' })
    }

    if (query.hasCausal === true && entry.hasCausal) {
      matches.push({ source: 'causal', reason: 'causal explanation available' })
    }

    if (query.minConfidence !== undefined && entry.summaryConfidence !== undefined && entry.summaryConfidence >= query.minConfidence) {
      matches.push({ source: 'snapshot', reason: `summary confidence ${entry.summaryConfidence} ≥ ${query.minConfidence}` })
    }

    if (matches.length > 0) {
      results.push({ runId: entry.runId, matches })
    }
  }

  results.sort((a, b) => {
    const ea = index.lookup(a.runId)
    const eb = index.lookup(b.runId)
    return (eb?.timestamp ?? 0) - (ea?.timestamp ?? 0)
  })

  return results
}
