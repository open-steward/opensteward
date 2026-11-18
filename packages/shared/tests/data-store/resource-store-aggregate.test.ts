/**
 * `ResourceStore.aggregate()` and `SyncStore.outcomesByDay()` — the SQL the
 * dashboard metric catalog runs. Same dual-backend harness as
 * resource-store-browse.test.ts: SQLite always, Postgres when
 * TEST_DATABASE_URL is set (the schema is dropped per test).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { ResourceStore, ResourcePageError } from '../../src/data-store/resource-store'
import { SyncStore } from '../../src/data-store/sync-store'

const BACKENDS: Array<{ name: string; open: () => Promise<DbHandle> }> = [
  { name: 'sqlite', open: () => openDb({ sqlitePath: ':memory:' }) },
]
if (process.env.TEST_DATABASE_URL) {
  BACKENDS.push({
    name: 'postgres',
    open: () => openDb({ databaseUrl: process.env.TEST_DATABASE_URL }),
  })
}

describe.each(BACKENDS)('ResourceStore.aggregate [$name]', (backend) => {
  let handle: DbHandle
  let store: ResourceStore

  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    store = await ResourceStore.create(handle)
    const orders = [
      {
        id: 'o1',
        createdAt: '2026-03-01T10:00:00Z',
        status: 'paid',
        totalPrice: { amount: 1000, currency: 'USD' },
      },
      {
        id: 'o2',
        createdAt: '2026-03-01T23:59:00Z',
        status: 'paid',
        totalPrice: { amount: 250, currency: 'USD' },
      },
      {
        id: 'o3',
        createdAt: '2026-03-02T08:00:00Z',
        status: 'open',
        totalPrice: { amount: 500, currency: 'JPY' },
      },
      {
        id: 'o4',
        createdAt: '2026-02-01T08:00:00Z',
        status: 'open',
        totalPrice: { amount: 7, currency: 'USD' },
      },
      {
        id: 'o5',
        createdAt: 'not a date',
        status: 'open',
        totalPrice: { amount: 9, currency: 'USD' },
      },
      { id: 'o6', status: 'void' },
    ]
    await store.upsertMany('ecommerce', 'shopify', 'c1', 'orders', orders)
    await store.upsert('ecommerce', 'shopify', 'c2', 'orders', 'x1', {
      id: 'x1',
      createdAt: '2026-03-01T00:00:00Z',
      status: 'paid',
      totalPrice: { amount: 99999, currency: 'USD' },
    })
  })

  afterEach(async () => {
    await handle.close()
  })

  it('counts per day inside the range, skipping values that are not dates', async () => {
    const rows = await store.aggregate({
      connectionIds: ['c1'],
      vertical: 'ecommerce',
      resourceType: 'orders',
      dateField: 'createdAt',
      from: '2026-03-01',
      to: '2026-03-31',
      byDay: true,
    })
    expect(rows).toEqual([
      { day: '2026-03-01', group: null, count: 2, sum: null },
      { day: '2026-03-02', group: null, count: 1, sum: null },
    ])
  })

  it('sums a nested amount per day and currency', async () => {
    const rows = await store.aggregate({
      connectionIds: ['c1'],
      resourceType: 'orders',
      dateField: 'createdAt',
      from: '2026-01-01',
      to: '2026-12-31',
      byDay: true,
      groupField: 'totalPrice.currency',
      sumField: 'totalPrice.amount',
    })
    expect(rows).toEqual([
      { day: '2026-02-01', group: 'USD', count: 1, sum: 7 },
      { day: '2026-03-01', group: 'USD', count: 2, sum: 1250 },
      { day: '2026-03-02', group: 'JPY', count: 1, sum: 500 },
    ])
  })

  it('groups by a field with no date bound, counting missing values as null', async () => {
    const rows = await store.aggregate({
      connectionIds: ['c1', 'c2'],
      resourceType: 'orders',
      groupField: 'status',
    })
    const byGroup = Object.fromEntries(rows.map((r) => [String(r.group), r.count]))
    expect(byGroup).toEqual({ open: 3, paid: 3, void: 1 })
  })

  it('is scoped to the connection ids it is given', async () => {
    expect(await store.aggregate({ connectionIds: [], resourceType: 'orders' })).toEqual([])
    const rows = await store.aggregate({ connectionIds: ['c2'], resourceType: 'orders' })
    expect(rows).toEqual([{ day: null, group: null, count: 1, sum: null }])
  })

  it('refuses malformed paths and days', async () => {
    await expect(
      store.aggregate({ connectionIds: ['c1'], resourceType: 'orders', groupField: "x'); --" }),
    ).rejects.toBeInstanceOf(ResourcePageError)
    await expect(
      store.aggregate({
        connectionIds: ['c1'],
        resourceType: 'orders',
        dateField: 'createdAt',
        from: '2026-3-1',
      }),
    ).rejects.toBeInstanceOf(ResourcePageError)
  })
})

describe.each(BACKENDS)('SyncStore.outcomesByDay [$name]', (backend) => {
  let handle: DbHandle
  let sync: SyncStore

  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    await ResourceStore.create(handle)
    sync = await SyncStore.create(handle)
    const at = (iso: string) => Date.parse(iso)
    const rows = [
      ['j1', 'c1', 'completed', at('2026-03-01T01:00:00Z')],
      ['j2', 'c1', 'failed', at('2026-03-01T23:00:00Z')],
      ['j3', 'c1', 'completed', at('2026-03-02T00:00:00Z')],
      ['j4', 'c2', 'completed', at('2026-03-02T05:00:00Z')],
      ['j5', 'c1', 'completed', at('2026-01-01T00:00:00Z')],
    ] as const
    for (const [id, conn, status, createdAt] of rows) {
      await handle.kysely
        .insertInto('sync_jobs')
        .values({
          id,
          vertical: 'crm',
          connection_id: conn,
          platform: 'hubspot',
          tenant_id: null,
          status,
          created_at: createdAt,
        })
        .execute()
    }
  })

  afterEach(async () => {
    await handle.close()
  })

  it('counts jobs per UTC day and status inside the window', async () => {
    const rows = await sync.outcomesByDay({
      connectionIds: null,
      fromMs: Date.parse('2026-03-01T00:00:00Z'),
      toMs: Date.parse('2026-04-01T00:00:00Z'),
    })
    expect(rows).toEqual(
      expect.arrayContaining([
        { day: '2026-03-01', status: 'completed', count: 1 },
        { day: '2026-03-01', status: 'failed', count: 1 },
        { day: '2026-03-02', status: 'completed', count: 2 },
      ]),
    )
    expect(rows).toHaveLength(3)
  })

  it('filters by connection', async () => {
    const rows = await sync.outcomesByDay({
      connectionIds: ['c2'],
      fromMs: 0,
      toMs: Date.parse('2027-01-01T00:00:00Z'),
    })
    expect(rows).toEqual([{ day: '2026-03-02', status: 'completed', count: 1 }])
    expect(await sync.outcomesByDay({ connectionIds: [], fromMs: 0, toMs: Date.now() })).toEqual([])
  })
})
