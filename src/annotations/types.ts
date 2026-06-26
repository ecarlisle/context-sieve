export type AnnotationType =
  | 'note'
  | 'question'
  | 'issue'
  | 'insight'
  | 'decision'

export type Annotation = {
  id: string
  runId: string
  frameIndex: number
  stage?: string

  author: string
  type: AnnotationType
  content: string

  createdAt: number
}
