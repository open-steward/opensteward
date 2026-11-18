import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../../src/db'
import type { DbHandle } from '../../src/db'
import { LICENSE_STATE_NAMESPACE, LicenseStateStore } from '../../src/licensing/state-store'

// SQLite always; Postgres when TEST_DATABASE_URL is set (`pnpm test:pg`).
const PG = process.env.TEST_DATABASE_URL
const BACKENDS: Array<{ name: string; open: () => Promise<DbHandle> }> = [
  { name: 'sqlite', open: () => openDb({ sqlitePath: ':memory:' }) },
]
if (PG) BACKENDS.push({ name: 'postgres', open: () => openDb({ databaseUrl: PG }) })

const T = Date.parse('2026-10-09T12:00:00.000Z')
const H = 3_600_000
const DAY = 24 * H

describe.each(BACKENDS)('LicenseStateStore [$name]', (backend) => {
  let handle: DbHandle
  let store: LicenseStateStore
  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres')
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    store = await LicenseStateStore.create(handle)
  })
  afterEach(async () => {
    await handle.close()
  })

  it('migrates under its own namespace (what the db-copy profile records)', async () => {
    expect(LICENSE_STATE_NAMESPACE).toBe('license_state')
    const applied = (await handle.kysely
      .selectFrom('_schema_migrations')
      .select('version')
      .where('namespace', '=', 'license_state')
      .execute()) as Array<{ version: number | string }>
    expect(applied.map((r) => Number(r.version))).toEqual([1])
  })
  it('the first observation is the system time', async () => {
    expect(await store.observe(T)).toEqual({
      effectiveNowMs: T,
      maxSeenAtMs: T,
      rollbackDetected: false,
    })
    expect(await store.maxSeenAt()).toBe(T)
  })
  it('[L7:C01] a rollback within 24 h is believed: max T, now T−12h → effective T−12h, no flag', async () => {
    await store.observe(T)
    expect(await store.observe(T - 12 * H)).toEqual({
      effectiveNowMs: T - 12 * H,
      maxSeenAtMs: T,
      rollbackDetected: false,
    })
  })
  it('[L7:C02] beyond 24 h it is flagged and clamped: max T, now T−48h → effective T−24h', async () => {
    await store.observe(T)
    expect(await store.observe(T - 48 * H)).toEqual({
      effectiveNowMs: T - 24 * H,
      maxSeenAtMs: T,
      rollbackDetected: true,
    })
    // Exactly 24 h back is still within tolerance: the flag starts strictly beyond it.
    expect(await store.observe(T - 24 * H)).toEqual({
      effectiveNowMs: T - 24 * H,
      maxSeenAtMs: T,
      rollbackDetected: false,
    })
  })
  it('max_seen_at only moves forward', async () => {
    await store.observe(T + 5 * H)
    await store.observe(T)
    await store.observe(T - 100 * H)
    expect(await store.maxSeenAt()).toBe(T + 5 * H)
  })
  it('a forward clock spike poisons max_seen_at until the row is deleted (Review Focus #3)', async () => {
    await store.observe(T + 400 * DAY)
    expect(await store.observe(T)).toEqual({
      effectiveNowMs: T + 399 * DAY,
      maxSeenAtMs: T + 400 * DAY,
      rollbackDetected: true,
    })
    await handle.kysely.deleteFrom('license_state').execute() // the documented remedy
    expect(await store.observe(T)).toEqual({
      effectiveNowMs: T,
      maxSeenAtMs: T,
      rollbackDetected: false,
    })
  })
})

describe('LicenseStateStore persistence (SQLite file)', () => {
  it('survives a restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lic-state-'))
    const path = join(dir, 'credentials.db')
    try {
      const h1 = await openDb({ sqlitePath: path })
      await (await LicenseStateStore.create(h1)).observe(T)
      await h1.close()
      const h2 = await openDb({ sqlitePath: path })
      const s2 = await LicenseStateStore.create(h2)
      expect(await s2.maxSeenAt()).toBe(T)
      expect((await s2.observe(T - 72 * H)).rollbackDetected).toBe(true)
      await h2.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe.runIf(!!PG)('LicenseStateStore on Postgres: replicas racing', () => {
  it('interleaved observes from two handles keep the largest value', async () => {
    const a = await openDb({ databaseUrl: PG })
    const b = await openDb({ databaseUrl: PG })
    try {
      await a.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
      const sa = await LicenseStateStore.create(a)
      const sb = await LicenseStateStore.create(b)
      const times = Array.from({ length: 40 }, (_, i) => T + ((i * 39) % 40) * H)
      await Promise.all(times.map((t, i) => (i % 2 ? sa : sb).observe(t)))
      expect(await sa.maxSeenAt()).toBe(Math.max(...times))
    } finally {
      await a.close()
      await b.close()
    }
  })
})
