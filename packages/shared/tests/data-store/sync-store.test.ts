import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { SyncStore } from '../../src/data-store/sync-store'

// SQLite always (`:memory:` is fresh per open); Postgres when TEST_DATABASE_URL
// is set (CI service container / local docker). For Postgres each test drops the
// public schema before creating the store so the shared db stays isolated.
const BACKENDS: Array<{ name: string; open: () => Promise<DbHandle> }> = [
  { name: 'sqlite', open: () => openDb({ sqlitePath: ':memory:' }) },
]
if (process.env.TEST_DATABASE_URL) {
  BACKENDS.push({
    name: 'postgres',
    open: () => openDb({ databaseUrl: process.env.TEST_DATABASE_URL }),
  })
}

describe.each(BACKENDS)('SyncStore [$name]', (backend) => {
  let handle: DbHandle
  let store: SyncStore

  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    store = await SyncStore.create(handle)
  })

  afterEach(async () => {
    await handle.close()
  })

  it('create() inserts a job in pending', async () => {
    const job = await store.create('accounting', 'conn-1', 'fortnox', 'tenant-a', null)
    expect(job.id).toBeDefined()
    expect(job.vertical).toBe('accounting')
    expect(job.connectionId).toBe('conn-1')
    expect(job.platform).toBe('fortnox')
    expect(job.tenantId).toBe('tenant-a')
    expect(job.status).toBe('pending')
  })

  it('findActive scoped to vertical', async () => {
    await store.create('accounting', 'conn-1', 'fortnox', null, null)
    expect(await store.findActive('accounting', 'conn-1')).not.toBeNull()
    expect(await store.findActive('crm', 'conn-1')).toBeNull()
  })

  it('findPending picks the oldest job for a vertical', async () => {
    const j1 = await store.create('accounting', 'c1', 'fortnox', null, null)
    await store.create('crm', 'c2', 'hubspot', null, null)
    const j3 = await store.create('accounting', 'c3', 'fortnox', null, null)
    void j1
    void j3
    const pending = await store.findPending('accounting')
    expect(pending?.connectionId).toBe('c1')
    expect((await store.findPending('crm'))?.connectionId).toBe('c2')
  })

  it('lifecycle: pending → running → completed', async () => {
    const j = await store.create('accounting', 'c1', 'fortnox', null, null)
    await store.markRunning(j.id)
    expect((await store.get(j.id))?.status).toBe('running')
    await store.markCompleted(j.id, { invoices: { synced: 10, status: 'completed' } })
    const final = await store.get(j.id)
    expect(final?.status).toBe('completed')
    expect(final?.progress?.invoices?.synced).toBe(10)
  })

  it('resetRunning(vertical) resets only that vertical', async () => {
    const a = await store.create('accounting', 'c1', 'fortnox', null, null)
    const c = await store.create('crm', 'c2', 'hubspot', null, null)
    await store.markRunning(a.id)
    await store.markRunning(c.id)
    expect(await store.resetRunning('accounting')).toBe(1)
    expect((await store.get(a.id))?.status).toBe('pending')
    expect((await store.get(c.id))?.status).toBe('running')
  })

  it('list filters by vertical', async () => {
    await store.create('accounting', 'c1', 'fortnox', null, null)
    await store.create('crm', 'c2', 'hubspot', null, null)
    const acc = await store.list({ vertical: 'accounting' })
    expect(acc.length).toBe(1)
    expect(acc[0].vertical).toBe('accounting')
  })

  // A2: `GET /v1/{vertical}/sync?limit=abc` (and `?limit=0`) reach here as
  // `filter.limit = NaN` / `0` — both falsy. The old guard, `if
  // (filter?.limit) q = q.limit(filter.limit)`, treated a falsy limit as "no
  // limit was requested" and skipped `.limit()` entirely, turning a bounded
  // page into a full dump of every sync job for the connection on the public
  // `/sync` route in all nine verticals.
  it('a NaN or zero limit does not drop the LIMIT clause (A2)', async () => {
    for (let i = 0; i < 60; i++) {
      await store.create('accounting', `c${i}`, 'fortnox', null, null)
    }
    // Mirrors the router: `Math.min(parseInt('abc', 10), 100)` is `NaN`.
    const withNaN = await store.list({ vertical: 'accounting', limit: Math.min(NaN, 100) })
    expect(withNaN).toHaveLength(50) // falls back to the default, not unbounded (60 rows exist)

    // Mirrors the router: `Math.min(parseInt('0', 10), 100)` is `0`.
    const withZero = await store.list({ vertical: 'accounting', limit: Math.min(0, 100) })
    expect(withZero).toHaveLength(50)

    // A negative, finite limit is equally nonsensical and must not widen the
    // result set either.
    const withNegative = await store.list({ vertical: 'accounting', limit: -1 })
    expect(withNegative).toHaveLength(50)

    // Sanity: a genuine positive limit is still honoured exactly.
    expect(await store.list({ vertical: 'accounting', limit: 10 })).toHaveLength(10)
  })

  it('caps at 200 even when a caller asks for more', async () => {
    for (let i = 0; i < 205; i++) {
      await store.create('accounting', `c${i}`, 'fortnox', null, null)
    }
    expect(await store.list({ vertical: 'accounting', limit: 10_000 })).toHaveLength(200)
  })

  // Same class of bug as A2, not the falsy instance but the fractional one:
  // the router parses with `parseInt`, which truncates, so this path isn't
  // reachable from `?limit=` today — but `Number.isFinite(2.5)` is `true`,
  // so a finite-only guard would let a fraction through to `.limit(2.5)`,
  // and SQLite's `OP_MustBeInt` rejects a non-integral value with the same
  // `SqliteError: datatype mismatch` A1/A6 hit. `Number.isInteger` closes it
  // here too, for symmetry with the other three stores.
  it('a fractional limit does not 500 and falls back to the default', async () => {
    await store.create('accounting', 'c1', 'fortnox', null, null)
    expect(await store.list({ vertical: 'accounting', limit: 2.5 })).toHaveLength(1)
  })

  // An omitted `limit` used to mean "no bound at all" — the one behaviour
  // this store had that no sibling store shares (`EndUserStore`,
  // `WebhookDeliveryStore`, `ConnectSessionStore`, and `AdminStore.listAudit`
  // all apply their own default when no limit is given). No current caller
  // reaches this over HTTP (every router always computes and passes an
  // explicit number), but Part E rewrites this exact method, and leaving
  // "omitted = unbounded" in place would mean a future non-paginated caller
  // inherits an unbounded dump with no compiler and no test to catch it.
  it('an omitted limit still applies the 50-row default, not "no bound at all"', async () => {
    for (let i = 0; i < 60; i++) {
      await store.create('accounting', `d${i}`, 'fortnox', null, null)
    }
    expect(await store.list({ vertical: 'accounting' })).toHaveLength(50)
  })

  it('cleanup removes an old terminal job once a newer success supersedes it', async () => {
    const j = await store.create('accounting', 'c1', 'fortnox', null, null)
    await store.markCompleted(j.id, {})
    // Backdate created_at to 31 days ago
    await handle.kysely
      .updateTable('sync_jobs')
      .set({ created_at: Date.now() - 31 * 86_400_000 })
      .where('id', '=', j.id)
      .execute()
    // Alone, it is this connection's latest sync, which a schedule reads.
    expect(await store.cleanup(30)).toBe(0)
    const newer = await store.create('accounting', 'c1', 'fortnox', null, null)
    await store.markCompleted(newer.id, {})
    expect(await store.cleanup(30)).toBe(1)
    expect(await store.get(j.id)).toBeNull()
  })
})
