export interface Config {
  enableCompression: boolean
  enableDeduplication: boolean
  enablePruning: boolean
  enableShadowPruning: boolean
  pruningThreshold: number
  port: number
}

export function defaultConfig(): Config {
  return {
    enableCompression: false,
    enableDeduplication: false,
    enablePruning: false,
    enableShadowPruning: true,
    pruningThreshold: 20,
    port: 3000,
  }
}
