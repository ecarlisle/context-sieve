import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'istanbul',
      include: [
        'src/pipeline/**',
        'src/providers/**',
        'src/snapshots/**',
        'src/metrics/index.ts',
        'src/config/index.ts',
        'src/compression/index.ts',
      ],
      exclude: [
        'src/pipeline/types.ts',
        'src/providers/interface.ts',
        'src/providers/types.ts',
        'src/providers/index.ts',
        'src/providers/config/loader.ts',
        'src/providers/adapters/**',
        'src/snapshots/types.ts',
        'src/snapshots/index.ts',
        'src/snapshots/converter.ts',
        'src/snapshots/printInspect.ts',
        'src/compression/summarize.ts',
        'src/compression/prune.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 50,
        functions: 80,
        lines: 80,
      },
    },
  },
})
