import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Suites open sqlite/Postgres handles, write Parquet through WebAssembly
    // and run migrations; `turbo run test` runs every package at once, so the
    // budget has to hold on a loaded machine. A genuine hang still fails.
    testTimeout: 30_000,
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: { TZ: 'UTC', OST_ALLOW_UNAUTH_ADMIN: '1' },
    // The dual-backend suites reset Postgres schemas in setup; serialize
    // files for the Postgres leg, full parallelism for SQLite.
    fileParallelism: !process.env.TEST_DATABASE_URL,
  },
})
