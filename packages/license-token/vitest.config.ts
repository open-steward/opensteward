import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Same budget as the other workspaces: `turbo run test` runs every package at once,
    // so a loaded machine must not turn the byte-sweep contract tests into timeouts.
    testTimeout: 30_000,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
