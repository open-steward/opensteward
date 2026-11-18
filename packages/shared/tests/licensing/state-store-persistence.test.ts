/**
 * Clock-rollback protection is only as durable as max_seen_at (handover §5.6).
 * Kept in memory, a restart would reset it and a clock wound back past expiry
 * would be believed. Every "boot" here is a fresh handle onto the SAME
 * database: a real SQLite file (not :memory:), and Postgres under
 * `pnpm test:pg shared`.
 *
 * C03 and C04 are tagged on separate describes on purpose. The Postgres one
 * only runs with TEST_DATABASE_URL, so the SQLite run must never satisfy its
 * tag (review A3 #11; scripts/license-test-matrix.test.ts enforces it).
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, type DbHandle } from '@opensteward/shared'
import { LicenseStateStore } from '../../src/licensing/state-store'

const H = 3_600_000
const T = Date.UTC(2027, 0, 15, 12)
const PG = process.env.TEST_DATABASE_URL
const tmp = mkdtempSync(join(tmpdir(), 'license-state-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

interface Backend {
  open: () => Promise<DbHandle>
  reset: () => Promise<void>
}
let sqliteFile = ''
let n = 0
const SQLITE: Backend = {
  open: () => openDb({ sqlitePath: sqliteFile }),
  reset: async () => {
    sqliteFile = join(tmp, `credentials-${++n}.db`)
  },
}
const POSTGRES: Backend = {
  open: () => openDb({ databaseUrl: PG }),
  reset: async () => {
    const h = await openDb({ databaseUrl: PG })
    try {
      await h.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    } finally {
      await h.close()
    }
  },
}

function persistsAcrossRestarts(backend: Backend): void {
  beforeEach(() => backend.reset())
  /** One process lifetime: open, migrate, observe once, close. */
  async function boot(systemNowMs: number) {
    const handle = await backend.open()
    try {
      return await (await LicenseStateStore.create(handle)).observe(systemNowMs)
    } finally {
      await handle.close()
    }
  }

  it('a rollback beyond 24 h after a restart is clamped and flagged', async () => {
    await boot(T)
    expect(await boot(T - 48 * H)).toEqual({
      effectiveNowMs: T - 24 * H,
      maxSeenAtMs: T,
      rollbackDetected: true,
    })
  })
  it('a rollback within 24 h after a restart is honoured and never lowers max_seen_at', async () => {
    await boot(T)
    expect(await boot(T - 12 * H)).toEqual({
      effectiveNowMs: T - 12 * H,
      maxSeenAtMs: T,
      rollbackDetected: false,
    })
    expect((await boot(T - 13 * H)).maxSeenAtMs).toBe(T)
  })
  it('a forward clock raises max_seen_at durably', async () => {
    await boot(T)
    await boot(T + 5 * H)
    expect(await boot(T - 10 * H)).toEqual({
      effectiveNowMs: T - 10 * H,
      maxSeenAtMs: T + 5 * H,
      rollbackDetected: false,
    })
  })
  it('concurrent writers on one database never lower max_seen_at', async () => {
    await boot(T + 10 * H)
    // Above AND below the seed, the largest issued first and a smaller one
    // last: a read-then-overwrite store (read the row, max() in JS, plain
    // write) loses the larger value to a concurrent smaller write, which a
    // set that only goes below the seed cannot show (review m36).
    const offsets = [19, 3, 17, 5, 15, 12, 1, 11, 9]
    const handles = await Promise.all([backend.open(), backend.open()])
    try {
      const [a, b] = await Promise.all(handles.map((h) => LicenseStateStore.create(h)))
      await Promise.all(offsets.map((o, i) => (i % 2 ? a! : b!).observe(T + o * H)))
    } finally {
      await Promise.all(handles.map((h) => h.close()))
    }
    expect((await boot(T)).maxSeenAtMs).toBe(T + 19 * H)
  })
}

describe('license_state survives restarts on SQLite [L7:C03]', () => persistsAcrossRestarts(SQLITE))
describe.runIf(PG)('license_state survives restarts on Postgres [L7:C04]', () =>
  persistsAcrossRestarts(POSTGRES),
)
