import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    // Vitest's 5s default is sized for pure unit tests. These suites open
    // sqlite files and run migrations, walk the source tree, and spawn real
    // processes — and `turbo run test` runs every package at once, so the
    // budget has to hold on a loaded machine rather than an idle one. Three
    // unrelated suites timed out under full parallelism and passed on the
    // same commit at `--concurrency=3`; admin-api, mcp-server and cli had
    // each already raised theirs after hitting the same thing. A genuine
    // hang still fails the run, just later.
    testTimeout: 30_000,
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/journeys/**/*.test.ts'],
  },
})
