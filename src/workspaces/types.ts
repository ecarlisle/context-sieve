export type Workspace = {
  id: string
  name: string
  createdAt: number
  runIds: string[]
  replayIds: string[]
  benchmarkIds: string[]
  regressionIds: string[]
  plugins: string[]
}

export type CreateWorkspaceInput = {
  name: string
  plugins?: string[]
}
