import type { Timeline, TimelineFrame } from './types.js'

export function getFrame(timeline: Timeline, index: number): TimelineFrame | undefined {
  if (index < 0 || index >= timeline.frames.length) return undefined
  return timeline.frames[index]
}

export function nextFrame(timeline: Timeline, currentIndex: number): TimelineFrame | undefined {
  return getFrame(timeline, currentIndex + 1)
}

export function prevFrame(timeline: Timeline, currentIndex: number): TimelineFrame | undefined {
  return getFrame(timeline, currentIndex - 1)
}

export function getCurrentFrame(timeline: Timeline, currentIndex: number): TimelineFrame | undefined {
  return getFrame(timeline, currentIndex)
}

export function frameCount(timeline: Timeline): number {
  return timeline.frames.length
}
