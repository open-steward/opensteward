import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/journeys/**/*.test.ts',
    ],
    // CI runners execute these suites several times slower than a laptop
    // (the journeys file: ~20 s locally, ~140 s on CI). Hooks build a full
    // Fastify app per test, so they get the same budget as tests, in line
    // with the other workspace packages.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // The dual-backend store suites reset Postgres state with
    // `DROP SCHEMA public CASCADE` in beforeEach. When the Postgres leg runs
    // (TEST_DATABASE_URL set) those files share ONE database, so running them
    // concurrently lets one file drop another's tables mid-test. Serialize
    // files in that case; keep full parallelism for the default SQLite leg.
    fileParallelism: !process.env.TEST_DATABASE_URL,
    // Auto-restore env/global stubs after every test so one file's
    // `vi.stubEnv(...)` (e.g. lockout.test.ts disabling OST_DISABLE_LOCKOUT)
    // can't leak into another file sharing the worker.
    unstubEnvs: true,
    unstubGlobals: true,
  },
})
