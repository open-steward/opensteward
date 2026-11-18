import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The CLI tests spawn the built binary via cold `node dist/index.js`
    // starts (execFileSync). A single help invocation is ~1.5s; tests that
    // sweep several groups chain 3+ spawns and exceed Vitest's 5s default on
    // slower CI runners (smoke.test.ts "per-group help" hit ~5.1s). Raise the
    // ceiling so spawn count, not the clock, decides these.
    testTimeout: 30_000,
  },
})
