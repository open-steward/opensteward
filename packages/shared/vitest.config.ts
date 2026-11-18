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
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    // @opensteward/license-token resolves to its dist/, which `vitest run` does
    // not rebuild: on a stale one the licensing tests pass against the old
    // verifier. This stops the run first.
    globalSetup: ['./vitest.global-setup.ts'],
    // Dual-backend store suites reset Postgres with `DROP SCHEMA public CASCADE`
    // in setup; on one shared db that can't run concurrently across files.
    // Serialize files for the Postgres leg; full parallelism for SQLite.
    fileParallelism: !process.env.TEST_DATABASE_URL,
  },
})
