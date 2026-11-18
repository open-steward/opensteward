import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { ResourceStore } from '../../src/data-store/resource-store'

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

describe.each(BACKENDS)('ResourceStore [$name]', (backend) => {
  let handle: DbHandle
  let store: ResourceStore

  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    store = await ResourceStore.create(handle)
  })

  afterEach(async () => {
    await handle.close()
  })

  it('upsert + get round-trip', async () => {
    await store.upsert('accounting', 'fortnox', 'conn-1', 'invoices', 'inv-1', {
      id: 'inv-1',
      amount: 100,
    })
    const row = await store.get<{ id: string; amount: number }>(
      'accounting',
      'fortnox',
      'conn-1',
      'invoices',
      'inv-1',
    )
    expect(row).toEqual({ id: 'inv-1', amount: 100 })
  })

  it('get returns null for unknown key', async () => {
    expect(await store.get('accounting', 'fortnox', 'conn-1', 'invoices', 'missing')).toBeNull()
  })

  it('list returns rows for one connection only', async () => {
    await store.upsert('accounting', 'fortnox', 'conn-1', 'invoices', 'a', { id: 'a' })
    await store.upsert('accounting', 'fortnox', 'conn-1', 'invoices', 'b', { id: 'b' })
    await store.upsert('accounting', 'fortnox', 'conn-2', 'invoices', 'c', { id: 'c' })
    const rows = await store.list<{ id: string }>('accounting', 'fortnox', 'conn-1', 'invoices')
    expect(rows.map((r) => r.id).sort()).toEqual(['a', 'b'])
  })

  it('different verticals do not collide on the same key', async () => {
    await store.upsert('accounting', 'bexio', 'conn-1', 'contacts', 'c-1', { id: 'c-1', v: 'acc' })
    await store.upsert('crm', 'bexio', 'conn-1', 'contacts', 'c-1', { id: 'c-1', v: 'crm' })
    expect(
      await store.get<{ v: string }>('accounting', 'bexio', 'conn-1', 'contacts', 'c-1'),
    ).toEqual({ id: 'c-1', v: 'acc' })
    expect(await store.get<{ v: string }>('crm', 'bexio', 'conn-1', 'contacts', 'c-1')).toEqual({
      id: 'c-1',
      v: 'crm',
    })
  })

  it('upsertMany batches inserts in a transaction', async () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ id: `inv-${i}` }))
    await store.upsertMany('accounting', 'fortnox', 'conn-1', 'invoices', items)
    const rows = await store.list<{ id: string }>('accounting', 'fortnox', 'conn-1', 'invoices')
    expect(rows.length).toBe(50)
  })

  it('delete removes one row, leaves siblings', async () => {
    await store.upsert('accounting', 'fortnox', 'conn-1', 'invoices', 'a', { id: 'a' })
    await store.upsert('accounting', 'fortnox', 'conn-1', 'invoices', 'b', { id: 'b' })
    await store.delete('accounting', 'fortnox', 'conn-1', 'invoices', 'a')
    expect(await store.get('accounting', 'fortnox', 'conn-1', 'invoices', 'a')).toBeNull()
    expect(await store.get('accounting', 'fortnox', 'conn-1', 'invoices', 'b')).not.toBeNull()
  })

  it('deleteConnection cascades all resource types for a connection', async () => {
    await store.upsert('accounting', 'fortnox', 'conn-1', 'invoices', 'a', { id: 'a' })
    await store.upsert('accounting', 'fortnox', 'conn-1', 'contacts', 'b', { id: 'b' })
    await store.upsert('accounting', 'fortnox', 'conn-2', 'invoices', 'c', { id: 'c' })
    await store.deleteConnection('accounting', 'fortnox', 'conn-1')
    expect(await store.list('accounting', 'fortnox', 'conn-1', 'invoices')).toEqual([])
    expect(await store.list('accounting', 'fortnox', 'conn-1', 'contacts')).toEqual([])
    // conn-2 untouched
    expect((await store.list('accounting', 'fortnox', 'conn-2', 'invoices')).length).toBe(1)
  })

  it('handles null tenantId/connectionId', async () => {
    await store.upsert('accounting', 'fortnox', null, 'invoices', 'a', { id: 'a' })
    const row = await store.get('accounting', 'fortnox', null, 'invoices', 'a')
    expect(row).toEqual({ id: 'a' })
  })

  it('count returns the total across all rows', async () => {
    await store.upsert('accounting', 'fortnox', 'c', 'invoices', '1', { id: '1' })
    await store.upsert('crm', 'hubspot', 'c', 'contacts', '2', { id: '2' })
    expect(await store.count()).toBe(2)
  })

  it('get respects maxAgeMs (stale rows return null)', async () => {
    await store.upsert('accounting', 'fortnox', 'c', 'invoices', 'a', { id: 'a' })
    // Backdate the row to 10 minutes ago.
    await handle.kysely
      .updateTable('resources')
      .set({ updated_at: Date.now() - 10 * 60_000 })
      .where('resource_id', '=', 'a')
      .execute()
    expect(await store.get('accounting', 'fortnox', 'c', 'invoices', 'a')).not.toBeNull()
    expect(
      await store.get('accounting', 'fortnox', 'c', 'invoices', 'a', { maxAgeMs: 60_000 }),
    ).toBeNull()
    expect(
      await store.get('accounting', 'fortnox', 'c', 'invoices', 'a', { maxAgeMs: 60 * 60_000 }),
    ).not.toBeNull()
  })

  it('upsertMany returns the write time it stamped on the rows', async () => {
    // A clock that ticks on every read, so "the time it stamped" and "the
    // time when it returned" can never coincide by landing in one millisecond.
    let t = 1_700_000_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => (t += 7))
    let stamped: number
    try {
      stamped = await store.upsertMany('accounting', 'fortnox', 'c', 'invoices', [
        { id: 'a' },
        { id: 'b' },
      ])
    } finally {
      vi.restoreAllMocks()
    }
    const rows = (await handle.kysely
      .selectFrom('resources')
      .select(['updated_at'])
      .execute()) as Array<{ updated_at: number }>
    expect(rows.map((r) => r.updated_at)).toEqual([stamped, stamped])
  })

  describe('a cleared cache clears its completeness markers too', () => {
    // A marker left over rows that are gone lets the next single-record write
    // make an unfiltered list serve that one record as the whole collection.
    const mark = (vertical: string, platform: string, tenant: string, type: string) =>
      store.markCollectionComplete(vertical, platform, tenant, type)
    const marked = (vertical: string, platform: string, tenant: string, type: string) =>
      store.collectionCompletedAt(vertical, platform, tenant, type)

    it('deleteConnection drops that connection’s markers, and only those', async () => {
      await store.upsert('accounting', 'fortnox', 'c1', 'invoices', 'a', { id: 'a' })
      await mark('accounting', 'fortnox', 'c1', 'invoices')
      await mark('accounting', 'fortnox', 'c1', 'contacts')
      await mark('accounting', 'fortnox', 'c2', 'invoices')
      await mark('accounting', 'xero', 'c1', 'invoices')
      await mark('crm', 'fortnox', 'c1', 'invoices')

      await store.deleteConnection('accounting', 'fortnox', 'c1')

      expect(await marked('accounting', 'fortnox', 'c1', 'invoices')).toBeNull()
      expect(await marked('accounting', 'fortnox', 'c1', 'contacts')).toBeNull()
      expect(await marked('accounting', 'fortnox', 'c2', 'invoices')).not.toBeNull()
      expect(await marked('accounting', 'xero', 'c1', 'invoices')).not.toBeNull()
      expect(await marked('crm', 'fortnox', 'c1', 'invoices')).not.toBeNull()
      expect(await store.get('accounting', 'fortnox', 'c1', 'invoices', 'a')).toBeNull()
    })

    it('deleteAll(vertical) drops that vertical’s markers; deleteAll() drops every one', async () => {
      await mark('accounting', 'fortnox', 'c1', 'invoices')
      await mark('crm', 'hubspot', 'c1', 'contacts')

      await store.deleteAll('accounting')
      expect(await marked('accounting', 'fortnox', 'c1', 'invoices')).toBeNull()
      expect(await marked('crm', 'hubspot', 'c1', 'contacts')).not.toBeNull()

      await store.deleteAll()
      expect(await marked('crm', 'hubspot', 'c1', 'contacts')).toBeNull()
    })
  })

  describe('sweepCollection', () => {
    /** Set one row's write time, so the cutoff is exact rather than a race. */
    const stampAt = (resourceId: string, updatedAt: number) =>
      handle.kysely
        .updateTable('resources')
        .set({ updated_at: updatedAt })
        .where('resource_id', '=', resourceId)
        .execute()

    it('removes only rows written before the cutoff, and returns their ids', async () => {
      await store.upsertMany('accounting', 'fortnox', 'c', 'invoices', [
        { id: 'old-1' },
        { id: 'old-2' },
        { id: 'new' },
      ])
      const now = Date.now()
      await stampAt('old-1', now - 60_000)
      await stampAt('old-2', now - 50_000)
      await stampAt('new', now)

      const removed = await store.sweepCollection(
        'accounting',
        'fortnox',
        'c',
        'invoices',
        now - 30_000,
      )

      expect(removed.sort()).toEqual(['old-1', 'old-2'])
      const left = await store.list<{ id: string }>('accounting', 'fortnox', 'c', 'invoices')
      expect(left.map((r) => r.id)).toEqual(['new'])
    })

    it('removes rows of exactly one collection', async () => {
      // One old row in the target collection, and one beside it differing in
      // exactly one key — vertical, platform, tenant, resource type.
      const at = [
        ['accounting', 'fortnox', 'c', 'invoices', 'target'],
        ['crm', 'fortnox', 'c', 'invoices', 'other-vertical'],
        ['accounting', 'xero', 'c', 'invoices', 'other-platform'],
        ['accounting', 'fortnox', 'd', 'invoices', 'other-tenant'],
        ['accounting', 'fortnox', 'c', 'bills', 'other-type'],
      ] as const
      for (const [v, p, t, type, id] of at) {
        await store.upsertMany(v, p, t, type, [{ id }])
      }
      const now = Date.now()
      await handle.kysely
        .updateTable('resources')
        .set({ updated_at: now - 60_000 })
        .execute()

      const removed = await store.sweepCollection('accounting', 'fortnox', 'c', 'invoices', now)

      expect(removed).toEqual(['target'])
      const left = (await handle.kysely
        .selectFrom('resources')
        .select(['resource_id'])
        .execute()) as Array<{ resource_id: string }>
      expect(left.map((r) => r.resource_id).sort()).toEqual([
        'other-platform',
        'other-tenant',
        'other-type',
        'other-vertical',
      ])
    })

    it('keeps a row written exactly at the cutoff', async () => {
      // STRICT `<`: the worker's cutoff is a time it may itself have stamped.
      await store.upsertMany('accounting', 'fortnox', 'c', 'invoices', [
        { id: 'at' },
        { id: 'before' },
      ])
      const cutoff = Date.now() - 60_000
      await stampAt('at', cutoff)
      await stampAt('before', cutoff - 1)

      const removed = await store.sweepCollection('accounting', 'fortnox', 'c', 'invoices', cutoff)

      expect(removed).toEqual(['before'])
      expect(await store.get('accounting', 'fortnox', 'c', 'invoices', 'at')).not.toBeNull()
    })

    it('a null tenant sweeps only NULL-tenant rows', async () => {
      await store.upsertMany('accounting', 'fortnox', null, 'invoices', [{ id: 'no-tenant' }])
      await store.upsertMany('accounting', 'fortnox', 'c', 'invoices', [{ id: 'tenant-c' }])
      await store.upsertMany('accounting', 'fortnox', '', 'invoices', [{ id: 'empty-tenant' }])
      const now = Date.now()
      await handle.kysely
        .updateTable('resources')
        .set({ updated_at: now - 60_000 })
        .execute()

      const removed = await store.sweepCollection('accounting', 'fortnox', null, 'invoices', now)

      expect(removed).toEqual(['no-tenant'])
      expect(await store.get('accounting', 'fortnox', 'c', 'invoices', 'tenant-c')).not.toBeNull()
      expect(
        await store.get('accounting', 'fortnox', '', 'invoices', 'empty-tenant'),
      ).not.toBeNull()
      // `undefined` is the same null tenant.
      await store.upsertMany('accounting', 'fortnox', null, 'invoices', [{ id: 'again' }])
      await stampAt('again', now - 60_000)
      expect(
        await store.sweepCollection('accounting', 'fortnox', undefined, 'invoices', now),
      ).toEqual(['again'])
    })
  })

  it('list respects maxAgeMs (returns [] when oldest row exceeds TTL)', async () => {
    await store.upsert('accounting', 'fortnox', 'c', 'invoices', 'a', { id: 'a' })
    await store.upsert('accounting', 'fortnox', 'c', 'invoices', 'b', { id: 'b' })
    await handle.kysely
      .updateTable('resources')
      .set({ updated_at: Date.now() - 10 * 60_000 })
      .where('resource_id', '=', 'a')
      .execute()
    expect(
      (await store.list('accounting', 'fortnox', 'c', 'invoices', { maxAgeMs: 60_000 })).length,
    ).toBe(0)
    expect(
      (await store.list('accounting', 'fortnox', 'c', 'invoices', { maxAgeMs: 60 * 60_000 }))
        .length,
    ).toBe(2)
  })
})
