import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Vitest's 5s default is sized for pure unit tests. These suites open
    // sqlite files and run migrations, walk the source tree, and spawn real
    // processes — and `turbo run test` runs every package at once, so the
    // budget has to hold on a loaded machine rather than an idle one.
    // Suites can exceed the 5s default under full parallelism on a loaded
    // machine; a genuine hang still fails the run, just later.
    testTimeout: 30_000,
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
