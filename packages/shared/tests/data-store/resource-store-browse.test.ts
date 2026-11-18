/**
 * ResourceStore — change watermark (v4), tombstones (v5), keyset `page()`,
 * `changesSince()`, `countsByConnection()` and the `changed_at` backfill.
 *
 * Same dual-backend harness as resource-store.test.ts: SQLite always,
 * Postgres when TEST_DATABASE_URL is set (the schema is dropped per test).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { ResourceStore, ResourcePageError } from '../../src/data-store/resource-store'

const BACKENDS: Array<{ name: string; open: () => Promise<DbHandle> }> = [
  { name: 'sqlite', open: () => openDb({ sqlitePath: ':memory:' }) },
]
if (process.env.TEST_DATABASE_URL) {
  BACKENDS.push({
    name: 'postgres',
    open: () => openDb({ databaseUrl: process.env.TEST_DATABASE_URL }),
  })
}

describe.each(BACKENDS)('ResourceStore browse + change feed [$name]', (backend) => {
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
    vi.useRealTimers()
    await handle.close()
  })

  async function rowMeta(resourceId: string) {
    return (await handle.kysely
      .selectFrom('resources')
      .select(['updated_at', 'changed_at', 'data_hash'])
      .where('resource_id', '=', resourceId)
      .executeTakeFirstOrThrow()) as {
      updated_at: number
      changed_at: number | null
      data_hash: string | null
    }
  }

  describe('changed_at / data_hash', () => {
    it('moves changed_at only when the data changes; updated_at always moves', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(1_000_000)
      await store.upsert('crm', 'hubspot', 'c1', 'contacts', 'a', { id: 'a', n: 1 })
      const first = await rowMeta('a')
      expect(Number(first.changed_at)).toBe(1_000_000)
      expect(first.data_hash).toMatch(/^[0-9a-f]{64}$/)

      vi.setSystemTime(2_000_000)
      await store.upsertMany('crm', 'hubspot', 'c1', 'contacts', [
        { id: 'a', n: 1 } as { id: string },
      ])
      const same = await rowMeta('a')
      expect(Number(same.updated_at)).toBe(2_000_000)
      expect(Number(same.changed_at)).toBe(1_000_000)
      expect(same.data_hash).toBe(first.data_hash)

      vi.setSystemTime(3_000_000)
      await store.upsert('crm', 'hubspot', 'c1', 'contacts', 'a', { id: 'a', n: 2 })
      const changed = await rowMeta('a')
      expect(Number(changed.updated_at)).toBe(3_000_000)
      expect(Number(changed.changed_at)).toBe(3_000_000)
      expect(changed.data_hash).not.toBe(first.data_hash)
    })

    it('a legacy row (NULL hash, NULL changed_at) with unchanged data keeps its updated_at as changed_at', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(1_000_000)
      await store.upsert('crm', 'hubspot', 'c1', 'contacts', 'a', { id: 'a' })
      await handle.kysely
        .updateTable('resources')
        .set({ changed_at: null, data_hash: null })
        .execute()
      vi.setSystemTime(2_000_000)
      await store.upsert('crm', 'hubspot', 'c1', 'contacts', 'a', { id: 'a' })
      const m = await rowMeta('a')
      expect(Number(m.changed_at)).toBe(1_000_000)
      expect(m.data_hash).not.toBeNull()
    })

    it('backfillChangedAt fills NULL rows in batches from updated_at', async () => {
      await store.upsertMany(
        'crm',
        'hubspot',
        'c1',
        'contacts',
        Array.from({ length: 7 }, (_, i) => ({ id: `r${i}` })),
      )
      await handle.kysely
        .updateTable('resources')
        .set({ changed_at: null, updated_at: 42 })
        .execute()
      expect(await store.backfillChangedAt(3)).toBe(7)
      const rows = (await handle.kysely
        .selectFrom('resources')
        .select(['changed_at'])
        .execute()) as Array<{ changed_at: number }>
      expect(rows.every((r) => Number(r.changed_at) === 42)).toBe(true)
      expect(await store.backfillChangedAt()).toBe(0)
    })

    it('sweepCollection still relies on updated_at being re-stamped', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(1_000)
      await store.upsertMany('crm', 'hubspot', 'c1', 'contacts', [{ id: 'keep' }, { id: 'gone' }])
      vi.setSystemTime(5_000)
      const started = Date.now()
      await store.upsertMany('crm', 'hubspot', 'c1', 'contacts', [{ id: 'keep' }])
      expect(await store.sweepCollection('crm', 'hubspot', 'c1', 'contacts', started)).toEqual([
        'gone',
      ])
    })
  })

  describe('tombstones', () => {
    it('latestTombstoneId is 0 when empty, else the newest id', async () => {
      expect(await store.latestTombstoneId()).toBe(0)
      await store.upsert('crm', 'hubspot', 'c1', 'contacts', 'a', { id: 'a' })
      await store.upsert('crm', 'hubspot', 'c1', 'contacts', 'b', { id: 'b' })
      await store.delete('crm', 'hubspot', 'c1', 'contacts', 'a')
      await store.delete('crm', 'hubspot', 'c1', 'contacts', 'b')
      const all = await store.tombstonesSince(0)
      expect(await store.latestTombstoneId()).toBe(all[all.length - 1]!.id)
    })

    it('delete, sweepCollection, deleteConnection and deleteAll write tombstones', async () => {
      await store.upsert('crm', 'hubspot', 'c1', 'contacts', 'a', { id: 'a' })
      await store.upsert('crm', 'hubspot', 'c1', 'contacts', 'b', { id: 'b' })
      await store.upsert('crm', 'hubspot', 'c2', 'deals', 'd', { id: 'd' })
      await store.upsert('accounting', 'fortnox', 'c3', 'invoices', 'i', { id: 'i' })

      await store.delete('crm', 'hubspot', 'c1', 'contacts', 'a')
      // Deleting a missing row writes nothing.
      await store.delete('crm', 'hubspot', 'c1', 'contacts', 'missing')
      await store.sweepCollection('crm', 'hubspot', 'c1', 'contacts', Date.now() + 1)
      await store.deleteConnection('crm', 'hubspot', 'c2')
      await store.deleteAll('accounting')

      const t = await store.tombstonesSince(0)
      expect(
        t.map((x) => [x.vertical, x.platform, x.connectionId, x.resourceType, x.resourceId]),
      ).toEqual([
        ['crm', 'hubspot', 'c1', 'contacts', 'a'],
        ['crm', 'hubspot', 'c1', 'contacts', 'b'],
        ['crm', 'hubspot', 'c2', null, null],
        ['accounting', null, null, null, null],
      ])
      expect(t[0]!.id).toBeLessThan(t[1]!.id)
      expect(typeof t[0]!.deletedAt).toBe('number')
      expect(await store.tombstonesSince(t[1]!.id)).toHaveLength(2)
      expect(await store.tombstonesSince(0, 1)).toHaveLength(1)
    })
  })

  describe('page()', () => {
    async function seed(n: number, conn = 'c1') {
      for (let i = 0; i < n; i++) {
        vi.setSystemTime(1_000 + i)
        await store.upsert('crm', 'hubspot', conn, 'contacts', `r${String(i).padStart(2, '0')}`, {
          id: `r${i}`,
          name: `Person ${i}`,
          email: `p${i}@example.com`,
          score: i,
          active: i % 2 === 0,
          address: { city: i < 3 ? 'Oslo' : 'Bergen' },
          note: i === 4 ? '100%_off' : null,
        })
      }
    }

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
    })

    it('keyset-paginates by updated_at desc across pages without gaps or repeats', async () => {
      await seed(12)
      const seen: string[] = []
      let cursor: string | null | undefined
      let pages = 0
      do {
        const p = await store.page({
          connectionIds: ['c1'],
          resourceType: 'contacts',
          limit: 5,
          cursor,
        })
        expect(p.total).toBe(12)
        expect(p.totalCapped).toBe(false)
        seen.push(...p.items.map((i) => i.resourceId))
        cursor = p.nextCursor
        pages++
      } while (cursor)
      expect(pages).toBe(3)
      expect(seen).toEqual(
        Array.from({ length: 12 }, (_, i) => `r${String(11 - i).padStart(2, '0')}`),
      )
    })

    it('sorts by resource_id asc and returns item metadata', async () => {
      await seed(3)
      const p = await store.page({
        connectionIds: ['c1'],
        resourceType: 'contacts',
        sort: 'resource_id',
        dir: 'asc',
        vertical: 'crm',
      })
      expect(p.items.map((i) => i.resourceId)).toEqual(['r00', 'r01', 'r02'])
      const first = p.items[0]!
      expect(first).toMatchObject({
        resourceType: 'contacts',
        platform: 'hubspot',
        vertical: 'crm',
        connectionId: 'c1',
        updatedAt: 1_000,
        changedAt: 1_000,
        fetchedAt: 1_000,
        normVersion: null,
      })
      expect((first.data as { email: string }).email).toBe('p0@example.com')
    })

    it('rejects a cursor issued for another sort order, and garbage', async () => {
      await seed(3)
      const p = await store.page({ connectionIds: ['c1'], resourceType: 'contacts', limit: 1 })
      await expect(
        store.page({
          connectionIds: ['c1'],
          resourceType: 'contacts',
          cursor: p.nextCursor,
          sort: 'resource_id',
        }),
      ).rejects.toBeInstanceOf(ResourcePageError)
      await expect(
        store.page({ connectionIds: ['c1'], resourceType: 'contacts', cursor: 'not-a-cursor' }),
      ).rejects.toMatchObject({ code: 'INVALID_CURSOR' })
    })

    it('filters: eq (string, number, boolean), contains, gt/lt, is_null, nested paths', async () => {
      await seed(6)
      const ids = async (filters: Parameters<ResourceStore['page']>[0]['filters']) =>
        (
          await store.page({
            connectionIds: ['c1'],
            resourceType: 'contacts',
            sort: 'resource_id',
            dir: 'asc',
            filters,
          })
        ).items.map((i) => i.resourceId)

      expect(await ids([{ path: 'email', op: 'eq', value: 'p2@example.com' }])).toEqual(['r02'])
      expect(await ids([{ path: 'score', op: 'eq', value: 3 }])).toEqual(['r03'])
      expect(await ids([{ path: 'score', op: 'eq', value: '3' }])).toEqual(['r03'])
      expect(await ids([{ path: 'active', op: 'eq', value: true }])).toEqual(['r00', 'r02', 'r04'])
      expect(await ids([{ path: 'score', op: 'gt', value: 3 }])).toEqual(['r04', 'r05'])
      expect(await ids([{ path: 'score', op: 'lt', value: 1 }])).toEqual(['r00'])
      expect(await ids([{ path: 'address.city', op: 'eq', value: 'Oslo' }])).toEqual([
        'r00',
        'r01',
        'r02',
      ])
      expect(await ids([{ path: 'name', op: 'contains', value: 'SON 5' }])).toEqual(['r05'])
      expect(await ids([{ path: 'note', op: 'is_null' }])).toHaveLength(5)
      expect(await ids([{ path: 'missing', op: 'is_null' }])).toHaveLength(6)
      // LIKE wildcards in the value are literal.
      expect(await ids([{ path: 'note', op: 'contains', value: '%_' }])).toEqual(['r04'])
      expect(await ids([{ path: 'name', op: 'contains', value: '%' }])).toEqual([])
      // Combined filters AND together.
      expect(
        await ids([
          { path: 'address.city', op: 'eq', value: 'Bergen' },
          { path: 'active', op: 'eq', value: false },
        ]),
      ).toEqual(['r03', 'r05'])
    })

    it('q searches the resource id and the given searchPaths only', async () => {
      await seed(6)
      const p = await store.page({
        connectionIds: ['c1'],
        resourceType: 'contacts',
        q: 'person 3',
        searchPaths: ['name'],
      })
      expect(p.items.map((i) => i.resourceId)).toEqual(['r03'])
      const byId = await store.page({ connectionIds: ['c1'], resourceType: 'contacts', q: 'r05' })
      expect(byId.items.map((i) => i.resourceId)).toEqual(['r05'])
      const notSearched = await store.page({
        connectionIds: ['c1'],
        resourceType: 'contacts',
        q: 'example.com',
        searchPaths: ['name'],
      })
      expect(notSearched.items).toEqual([])
    })

    it('rejects an invalid path before querying', async () => {
      await expect(
        store.page({
          connectionIds: ['c1'],
          resourceType: 'contacts',
          filters: [{ path: "a') OR 1=1 --", op: 'eq', value: 'x' }],
        }),
      ).rejects.toMatchObject({ code: 'INVALID_PATH' })
      await expect(
        store.page({
          connectionIds: ['c1'],
          resourceType: 'contacts',
          q: 'x',
          searchPaths: ['a..b'],
        }),
      ).rejects.toMatchObject({ code: 'INVALID_PATH' })
    })

    it('scopes to the given connections and clamps limit', async () => {
      await seed(3, 'c1')
      await seed(2, 'c2')
      expect((await store.page({ connectionIds: ['c2'], resourceType: 'contacts' })).total).toBe(2)
      expect(
        (await store.page({ connectionIds: ['c1', 'c2'], resourceType: 'contacts' })).total,
      ).toBe(5)
      expect((await store.page({ connectionIds: [], resourceType: 'contacts' })).total).toBe(0)
      const p = await store.page({ connectionIds: ['c1'], resourceType: 'contacts', limit: 0 })
      expect(p.items).toHaveLength(1)
    })

    it('strips the raw payload on page reads', async () => {
      const policyStore = await ResourceStore.create(handle, { rawPayloadEnabled: () => false })
      await handle.kysely
        .insertInto('resources')
        .values({
          pk: 'payments:stripe:c1:charges:ch_1',
          vertical: 'payments',
          platform: 'stripe',
          tenant_id: 'c1',
          resource_type: 'charges',
          resource_id: 'ch_1',
          data: JSON.stringify({ id: 'ch_1', raw: { iban: 'X' } }),
          fetched_at: 1,
          updated_at: 1,
        })
        .execute()
      const p = await policyStore.page({ connectionIds: ['c1'], resourceType: 'charges' })
      expect((p.items[0]!.data as Record<string, unknown>).raw).toBeUndefined()
    })
  })

  describe('getRecord()', () => {
    it('returns one record with row metadata, or null', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(7_000)
      await store.upsert('crm', 'hubspot', 'c1', 'contacts', 'a', { id: 'a' }, 'v1')
      expect(await store.getRecord('crm', 'hubspot', 'c1', 'contacts', 'a')).toEqual({
        resourceId: 'a',
        resourceType: 'contacts',
        vertical: 'crm',
        platform: 'hubspot',
        connectionId: 'c1',
        data: { id: 'a' },
        fetchedAt: 7_000,
        updatedAt: 7_000,
        changedAt: 7_000,
        normVersion: 'v1',
      })
      expect(await store.getRecord('crm', 'hubspot', 'c1', 'contacts', 'b')).toBeNull()
    })
  })

  describe('changesSince()', () => {
    it('orders by (changed_at, pk), honours the watermark and holds back the lag window', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(1_000)
      await store.upsertMany('crm', 'hubspot', 'c1', 'contacts', [{ id: 'b' }, { id: 'a' }])
      vi.setSystemTime(2_000)
      await store.upsert('crm', 'hubspot', 'c1', 'contacts', 'c', { id: 'c' })
      // Unchanged rewrite: must not reappear in the feed.
      vi.setSystemTime(3_000)
      await store.upsertMany('crm', 'hubspot', 'c1', 'contacts', [{ id: 'a' }])
      vi.setSystemTime(10_000)

      const all = await store.changesSince({
        vertical: 'crm',
        resourceType: 'contacts',
        lagMs: 0,
      })
      expect(all.items.map((i) => i.resourceId)).toEqual(['a', 'b', 'c'])

      const batch1 = await store.changesSince({
        vertical: 'crm',
        resourceType: 'contacts',
        lagMs: 0,
        limit: 1,
      })
      expect(batch1.items.map((i) => i.resourceId)).toEqual(['a'])
      const batch2 = await store.changesSince({
        vertical: 'crm',
        resourceType: 'contacts',
        lagMs: 0,
        afterChangedAt: batch1.next!.afterChangedAt,
        afterPk: batch1.next!.afterPk,
      })
      expect(batch2.items.map((i) => i.resourceId)).toEqual(['b', 'c'])

      // Everything written within the last 8.5s is held back.
      const lagged = await store.changesSince({
        vertical: 'crm',
        resourceType: 'contacts',
        lagMs: 8_500,
      })
      expect(lagged.items.map((i) => i.resourceId)).toEqual(['a', 'b'])
      // Default lag (120s) holds everything back.
      expect(
        (await store.changesSince({ vertical: 'crm', resourceType: 'contacts' })).items,
      ).toEqual([])
      expect(
        (
          await store.changesSince({
            vertical: 'crm',
            resourceType: 'contacts',
            lagMs: 0,
            connectionIds: ['other'],
          })
        ).items,
      ).toEqual([])
    })
  })

  describe('countsByConnection()', () => {
    it('groups by connection, vertical, platform and type', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(5_000)
      await store.upsertMany('crm', 'hubspot', 'c1', 'contacts', [{ id: 'a' }, { id: 'b' }])
      vi.setSystemTime(6_000)
      await store.upsert('crm', 'hubspot', 'c1', 'deals', 'd', { id: 'd' })
      await store.upsert('accounting', 'fortnox', 'c2', 'invoices', 'i', { id: 'i' })
      const counts = (await store.countsByConnection()).sort((x, y) =>
        `${x.connectionId}${x.resourceType}`.localeCompare(`${y.connectionId}${y.resourceType}`),
      )
      expect(counts).toEqual([
        {
          connectionId: 'c1',
          vertical: 'crm',
          platform: 'hubspot',
          resourceType: 'contacts',
          count: 2,
          maxChangedAt: 5_000,
        },
        {
          connectionId: 'c1',
          vertical: 'crm',
          platform: 'hubspot',
          resourceType: 'deals',
          count: 1,
          maxChangedAt: 6_000,
        },
        {
          connectionId: 'c2',
          vertical: 'accounting',
          platform: 'fortnox',
          resourceType: 'invoices',
          count: 1,
          maxChangedAt: 6_000,
        },
      ])
    })
  })
})
