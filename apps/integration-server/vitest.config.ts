import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Vitest's 5s default is sized for pure unit tests. These suites open
    // sqlite files and run migrations, walk the source tree, and spawn real
    // processes — and `turbo run test` runs every package at once, so the
    // budget has to hold on a loaded machine rather than an idle one. Suites
    // that pass in isolation can time out under full parallelism; 30s holds
    // on a loaded machine while a genuine hang still fails the run, just
    // later.
    testTimeout: 30_000,
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // @opensteward/shared and the other workspace libraries resolve to their
    // dist/, which `vitest run` does not rebuild. Run on a stale dist, the
    // suite fails as a scatter of unrelated tests: 172 of them across 8 files
    // on 2026-09-29, which was taken for flakiness. This stops the run first.
    globalSetup: ['./vitest.global-setup.ts'],
    // Every workspace pins this.
    //
    // TZ matters here specifically: the shared `toIsoDatetime` parses
    // offset-less datetimes (e.g. MySQL-style '2019-11-27 11:40:36', which
    // several platform APIs return) through `new Date()`, which resolves them
    // in the host's local zone. Without a pin the same fixture yields a
    // different instant on a developer's machine than on a CI runner.
    // OST_ALLOW_UNAUTH_ADMIN: adminGuard fails CLOSED when ADMIN_SECRET is
    // unset — this flag is the only thing that opens it without one. Many router
    // tests exercise /admin, /connections and /v1/sync without wiring a secret,
    // a legitimate trusted-local context; declare it with the same explicit
    // opt-in an operator would use for local dev. Tests that set ADMIN_SECRET
    // (e.g. auth-connect-post) still test the header path — the flag is ignored
    // once a secret exists. The fail-closed path is covered directly in
    // packages/shared/tests/control-plane/admin-guard.test.ts.
    env: { TZ: 'UTC', OST_ALLOW_UNAUTH_ADMIN: '1' },
    // No `fileParallelism` gate here: unlike packages/shared and
    // apps/admin-api, this workspace has no dual-backend store suites that
    // reset Postgres with `DROP SCHEMA public CASCADE`, so there is nothing
    // to serialize against TEST_DATABASE_URL. (apps/webhook-gateway also has
    // no such gate — its Postgres suites reset via targeted
    // `DROP TABLE IF EXISTS deliveries; DROP TABLE IF EXISTS
    // _schema_migrations`, not a schema-wide drop.) CI's test-postgres job
    // runs only tests/analytics from here, which creates and drops its own
    // database rather than resetting a shared one. Full parallelism always.
  },
})
