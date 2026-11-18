/**
 * `ResourceStore.aggregateV2()`, `fetchValues()` and `lookupLabels()` — the
 * primitives the dashboard metric engine (v2) compiles to. Same dual-backend
 * harness as resource-store-aggregate.test.ts: SQLite always, Postgres when
 * TEST_DATABASE_URL is set (the schema is dropped per test). Every
 * expectation is hand-computed from the seed below, so the two dialects are
 * held to the same numbers.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import {
  ResourceStore,
  ResourcePageError,
  type AggregateV2Options,
  type MetricStoreFilter,
} from '../../src/data-store/resource-store'

const BACKENDS: Array<{ name: string; open: () => Promise<DbHandle> }> = [
  { name: 'sqlite', open: () => openDb({ sqlitePath: ':memory:' }) },
]
if (process.env.TEST_DATABASE_URL) {
  BACKENDS.push({
    name: 'postgres',
    open: () => openDb({ databaseUrl: process.env.TEST_DATABASE_URL }),
  })
}

/** "Now" for every relative predicate: Wednesday 2026-03-18, 12:00 UTC. */
const NOW = new Date('2026-03-18T12:00:00Z')

const DOCS = [
  // 2026-03-16 is a Monday. 23:30-05:00 is 04:30 UTC on the 17th (a Tuesday).
  {
    id: 'i1',
    type: 'INVOICE',
    status: 'PAID',
    currency: 'USD',
    total: 1000,
    paid: 1000,
    dueAt: '2026-03-10',
    paidAt: '2026-03-10T15:00:00Z',
    postedAt: '2026-03-16T23:30:00-05:00',
    tags: ['a', 'b'],
  },
  {
    id: 'i2',
    type: 'INVOICE',
    status: 'AUTHORIZED',
    currency: 'USD',
    total: 250,
    paid: 0,
    dueAt: '2026-03-17',
    postedAt: '2026-03-02T09:00:00Z',
    tags: ['b'],
  },
  {
    id: 'i3',
    status: 'Draft',
    currency: 'EUR',
    total: 99,
    dueAt: '2026-03-25',
    paidAt: '2026-03-30T00:00:00Z',
    postedAt: '2026-03-18',
    tags: [],
  },
  {
    id: 'i4',
    type: 'BILL',
    status: 'PAID',
    total: 5000,
    paid: 5000,
    dueAt: '2026-01-01',
    paidAt: '2026-01-05T08:00:00+02:00',
    postedAt: '2025-12-15T08:00:00Z',
    tags: 'not-an-array',
  },
  {
    id: 'i5',
    type: 'CREDITMEMO',
    status: 'VOIDED',
    currency: 'USD',
    total: 'n/a',
    postedAt: 'not a date',
    tags: ['a', 7],
  },
]

describe.each(BACKENDS)('ResourceStore metric queries [$name]', (backend) => {
  let handle: DbHandle
  let store: ResourceStore

  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    store = await ResourceStore.create(handle)
    await store.upsertMany('accounting', 'xero', 'c1', 'invoices', DOCS)
    // Another connection: never counted unless asked for.
    await store.upsert('accounting', 'xero', 'c2', 'invoices', 'x1', {
      id: 'x1',
      type: 'INVOICE',
      total: 7,
      postedAt: '2026-03-02',
    })
    await store.upsertMany('customer-support', 'zendesk', 'c1', 'tags', [
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Beta' },
    ])
    await store.upsertMany('customer-support', 'zendesk', 'c2', 'tags', [
      { id: 'a', name: 'Other tenant alpha' },
      { id: 'z', name: 'Zed' },
    ])
  })

  afterEach(async () => {
    await handle.close()
  })

  const base: AggregateV2Options = {
    connectionIds: ['c1'],
    vertical: 'accounting',
    resourceType: 'invoices',
    now: NOW,
  }
  const ids = async (filters: MetricStoreFilter[], extra: Partial<AggregateV2Options> = {}) => {
    const res = await store.fetchValues({
      ...base,
      ...extra,
      filters,
      fields: [{ path: 'id', as: 'text' }],
    })
    return res.rows.map((r) => r[0]).sort()
  }

  it('counts, sums and averages with no dimensions', async () => {
    const [row] = await store.aggregateV2({ ...base, valueField: 'total' })
    // 'n/a' is not a number: counted, not summed.
    expect(row).toEqual({ keys: [], count: 5, sum: 6349, valueCount: 4, avg: 6349 / 4 })
  })

  it('applies every filter op', async () => {
    expect(await ids([{ path: 'status', op: 'eq', value: 'PAID' }])).toEqual(['i1', 'i4'])
    expect(await ids([{ path: 'total', op: 'eq', value: 250 }])).toEqual(['i2'])
    // ne / not_in keep records without the field (i3 has no type).
    expect(await ids([{ path: 'type', op: 'ne', value: 'BILL' }])).toEqual(['i1', 'i2', 'i3', 'i5'])
    expect(await ids([{ path: 'type', op: 'not_in', value: ['BILL', 'CREDITMEMO'] }])).toEqual([
      'i1',
      'i2',
      'i3',
    ])
    expect(await ids([{ path: 'status', op: 'in', value: ['PAID', 'VOIDED'] }])).toEqual([
      'i1',
      'i4',
      'i5',
    ])
    expect(await ids([{ path: 'total', op: 'in', value: [99, 250] }])).toEqual(['i2', 'i3'])
    expect(await ids([{ path: 'status', op: 'in_ci', value: ['draft', 'paid'] }])).toEqual([
      'i1',
      'i3',
      'i4',
    ])
    expect(await ids([{ path: 'type', op: 'is_null' }])).toEqual(['i3'])
    expect(await ids([{ path: 'paidAt', op: 'not_null' }])).toEqual(['i1', 'i3', 'i4'])
    expect(await ids([{ path: 'total', op: 'gt', value: 250 }])).toEqual(['i1', 'i4'])
    expect(await ids([{ path: 'total', op: 'gte', value: 250 }])).toEqual(['i1', 'i2', 'i4'])
    expect(await ids([{ path: 'total', op: 'lt', value: 250 }])).toEqual(['i3'])
    expect(await ids([{ path: 'total', op: 'lte', value: 250 }])).toEqual(['i2', 'i3'])
    expect(await ids([{ path: 'dueAt', op: 'lt', value: '2026-03-17' }])).toEqual(['i1', 'i4'])
  })

  it('applies the now-relative filters by UTC day against the injected now', async () => {
    // today = 2026-03-18
    expect(await ids([{ path: 'dueAt', op: 'before_now' }])).toEqual(['i1', 'i2', 'i4'])
    expect(await ids([{ path: 'dueAt', op: 'after_now' }])).toEqual(['i3'])
    // older than 7 days: day < 2026-03-11
    expect(await ids([{ path: 'dueAt', op: 'older_than_days', value: 7 }])).toEqual(['i1', 'i4'])
    // within the last 7 days: 2026-03-11 … 2026-03-18
    expect(await ids([{ path: 'dueAt', op: 'within_last_days', value: 7 }])).toEqual(['i2'])
    // within the next 7 days: 2026-03-18 … 2026-03-25
    expect(await ids([{ path: 'dueAt', op: 'within_next_days', value: 7 }])).toEqual(['i3'])
    expect(await ids([{ path: 'dueAt', op: 'within_next_days', value: 6 }])).toEqual([])
    // a different now moves the answer
    expect(
      await ids([{ path: 'dueAt', op: 'before_now' }], { now: new Date('2026-03-12T00:00:00Z') }),
    ).toEqual(['i1', 'i4'])
  })

  it('compares two fields of a record: dates by day, numbers as numbers', async () => {
    // paid on or before the due day: i1 (same day, with a time), i4 not (Jan 5 > Jan 1)
    expect(await ids([], { compare: [{ left: 'paidAt', op: 'lte', right: 'dueAt' }] })).toEqual([
      'i1',
    ])
    expect(await ids([], { compare: [{ left: 'paidAt', op: 'gt', right: 'dueAt' }] })).toEqual([
      'i3',
      'i4',
    ])
    expect(await ids([], { compare: [{ left: 'paid', op: 'eq', right: 'total' }] })).toEqual([
      'i1',
      'i4',
    ])
    expect(await ids([], { compare: [{ left: 'paid', op: 'lt', right: 'total' }] })).toEqual(['i2'])
    // a date never compares with a number
    expect(await ids([], { compare: [{ left: 'paidAt', op: 'ne', right: 'total' }] })).toEqual([])
  })

  it('buckets by day, ISO week and month inside the range', async () => {
    const q = (unit: 'day' | 'week' | 'month') =>
      store.aggregateV2({
        ...base,
        dateField: 'postedAt',
        from: '2026-03-01',
        to: '2026-03-31',
        dimensions: [{ type: 'date', path: 'postedAt', unit }],
      })
    expect((await q('day')).map((r) => [r.keys[0], r.count])).toEqual([
      ['2026-03-02', 1],
      ['2026-03-16', 1],
      ['2026-03-18', 1],
    ])
    expect((await q('week')).map((r) => [r.keys[0], r.count])).toEqual([
      ['2026-W10', 1],
      ['2026-W12', 2],
    ])
    expect((await q('month')).map((r) => [r.keys[0], r.count])).toEqual([['2026-03', 3]])
    // ISO week-year across the new year: 2026-01-01 is in 2026-W01, 2025-12-29 too.
    const [wk] = await store.aggregateV2({
      ...base,
      filters: [{ path: 'id', op: 'eq', value: 'i4' }],
      dimensions: [{ type: 'date', path: 'dueAt', unit: 'week' }],
    })
    expect(wk?.keys).toEqual(['2026-W01'])
  })

  it('extracts weekday and hour in UTC, applying stored offsets', async () => {
    const rows = await store.aggregateV2({
      ...base,
      dimensions: [
        { type: 'date', path: 'postedAt', unit: 'weekday' },
        { type: 'date', path: 'postedAt', unit: 'hour' },
      ],
      filters: [{ path: 'id', op: 'in', value: ['i1', 'i2', 'i3', 'i4'] }],
    })
    expect(rows.map((r) => [...r.keys, r.count]).sort()).toEqual(
      [
        ['1', '09', 1], // i2 Mon 2026-03-02 09:00Z
        ['1', '08', 1], // i4 Mon 2025-12-15 08:00Z
        ['2', '04', 1], // i1 Mon 23:30 -05:00 = Tue 04:30 UTC
        ['3', null, 1], // i3 a bare date: a weekday, no hour
      ].sort(),
    )
  })

  it('groups by two dimensions and by unnested string arrays', async () => {
    const two = await store.aggregateV2({
      ...base,
      valueField: 'total',
      dimensions: [
        { type: 'field', path: 'status' },
        { type: 'field', path: 'currency' },
      ],
    })
    expect(two.map((r) => [...r.keys, r.count, r.sum])).toEqual(
      expect.arrayContaining([
        ['PAID', 'USD', 1, 1000],
        ['PAID', null, 1, 5000],
        ['AUTHORIZED', 'USD', 1, 250],
      ]),
    )
    expect(two).toHaveLength(5)
    const tags = await store.aggregateV2({
      ...base,
      dimensions: [{ type: 'field', path: 'tags', unnest: true }],
    })
    // strings only; a scalar where the array should be is skipped
    expect(tags.map((r) => [r.keys[0], r.count])).toEqual([
      ['a', 2],
      ['b', 2],
    ])
    await expect(
      store.aggregateV2({
        ...base,
        dimensions: [
          { type: 'field', path: 'tags', unnest: true },
          { type: 'field', path: 'tags', unnest: true },
        ],
      }),
    ).rejects.toBeInstanceOf(ResourcePageError)
  })

  it('bands numbers and ages dates relative to today', async () => {
    const bands = await store.aggregateV2({
      ...base,
      dimensions: [{ type: 'band', path: 'total', edges: [100, 1000] }],
    })
    // <100: i3 (99); 100–999: i2; ≥1000: i1, i4; non-number: null
    expect(bands.map((r) => [r.keys[0], r.count])).toEqual(
      expect.arrayContaining([
        ['0', 1],
        ['1', 1],
        ['2', 2],
        [null, 1],
      ]),
    )
    // past: days since dueAt with edges [0, 7, 30] — today 03-18
    const past = await store.aggregateV2({
      ...base,
      dimensions: [{ type: 'age', path: 'dueAt', direction: 'past', edges: [0, 7, 30] }],
    })
    // i3 due 03-25 (−7 → ≤0: '0'), i2 03-17 (1 → '1'), i1 03-10 (8 → '2'), i4 01-01 (76 → '3')
    expect(past.map((r) => [r.keys[0], r.count])).toEqual(
      expect.arrayContaining([
        ['0', 1],
        ['1', 1],
        ['2', 1],
        ['3', 1],
        [null, 1],
      ]),
    )
    // future: days until dueAt with edges [0, 7]
    const future = await store.aggregateV2({
      ...base,
      dimensions: [{ type: 'age', path: 'dueAt', direction: 'future', edges: [0, 7] }],
    })
    // i1, i2, i4 are past (≤0 → '0'); i3 in 7 days → '1'
    expect(future.map((r) => [r.keys[0], r.count])).toEqual(
      expect.arrayContaining([
        ['0', 3],
        ['1', 1],
      ]),
    )
  })

  it('fetches bounded values and samples systematically above the cap', async () => {
    const all = await store.fetchValues({
      ...base,
      fields: [
        { path: 'id', as: 'text' },
        { path: 'total', as: 'number' },
      ],
    })
    expect(all.total).toBe(5)
    expect(all.sampled).toBe(false)
    expect(all.rows).toContainEqual(['i5', null])
    const sample = await store.fetchValues({
      ...base,
      fields: [{ path: 'id', as: 'text' }],
      limit: 2,
    })
    expect(sample).toMatchObject({ total: 5, sampled: true })
    // stride ceil(5/2) = 3 over pk order → rows 1 and 4
    expect(sample.rows.map((r) => r[0])).toEqual(['i1', 'i4'])
  })

  it('resolves labels from the same connections only', async () => {
    const labels = await store.lookupLabels({
      connectionIds: ['c1'],
      vertical: 'customer-support',
      resourceType: 'tags',
      keyPath: 'id',
      labelPath: 'name',
      keys: ['a', 'b', 'z'],
    })
    expect([...labels.entries()].sort()).toEqual([
      ['a', 'Alpha'],
      ['b', 'Beta'],
    ])
    expect(
      await store.lookupLabels({ ...base, keyPath: 'id', labelPath: 'name', keys: [] }),
    ).toEqual(new Map())
  })

  it('refuses malformed paths, ops and values', async () => {
    const bad: Array<Partial<AggregateV2Options>> = [
      { filters: [{ path: "x'--", op: 'eq', value: 1 }] },
      { filters: [{ path: 'status', op: 'nope' as never }] },
      { filters: [{ path: 'status', op: 'in', value: [] }] },
      { filters: [{ path: 'dueAt', op: 'older_than_days', value: -1 }] },
      { compare: [{ left: 'a', op: 'like' as never, right: 'b' }] },
      { dimensions: [{ type: 'band', path: 'total', edges: [5, 1] }] },
      { dateField: 'postedAt', from: '2026-3-1' },
    ]
    for (const b of bad) {
      await expect(store.aggregateV2({ ...base, ...b })).rejects.toBeInstanceOf(ResourcePageError)
    }
    expect(await store.aggregateV2({ ...base, connectionIds: [] })).toEqual([])
  })

  it('names ISO weeks across the year boundary, including W53', async () => {
    await store.upsertMany('accounting', 'xero', 'c3', 'invoices', [
      { id: 'w1', postedAt: '2026-12-28' }, // Monday of 2026-W53
      { id: 'w2', postedAt: '2026-12-31T23:00:00Z' },
      { id: 'w3', postedAt: '2027-01-03' }, // Sunday, still 2026-W53
      { id: 'w4', postedAt: '2027-01-04' }, // Monday of 2027-W01
      { id: 'w5', postedAt: '2025-12-29' }, // Monday of 2026-W01
    ])
    const rows = await store.aggregateV2({
      ...base,
      connectionIds: ['c3'],
      dimensions: [
        { type: 'field', path: 'id' },
        { type: 'date', path: 'postedAt', unit: 'week' },
      ],
    })
    expect(Object.fromEntries(rows.map((r) => [r.keys[0], r.keys[1]]))).toEqual({
      w1: '2026-W53',
      w2: '2026-W53',
      w3: '2026-W53',
      w4: '2027-W01',
      w5: '2026-W01',
    })
  })

  it('treats impossible dates and offsets as NULL on both dialects, never failing the query', async () => {
    await store.upsertMany('accounting', 'xero', 'c4', 'invoices', [
      { id: 'y0', postedAt: '0000-01-01T10:00:00Z' }, // no year 0
      { id: 'd30', postedAt: '2026-02-30T10:00:00Z' }, // no such day
      { id: 'd29', postedAt: '2026-02-29' }, // 2026 is not a leap year
      { id: 'o24', postedAt: '2026-03-01T10:00:00+23:59' }, // beyond ±14:00
      { id: 'o1430', postedAt: '2026-03-01T10:00:00-14:30' },
      { id: 'ok14', postedAt: '2024-02-29T10:00:00+14:00' }, // leap day, max offset
      { id: 'okZ', postedAt: '2026-03-02T09:30:00.123Z' },
    ])
    const q = (dims: AggregateV2Options['dimensions']) =>
      store.aggregateV2({
        ...base,
        connectionIds: ['c4'],
        dimensions: [{ type: 'field', path: 'id' }, ...(dims ?? [])],
      })
    const wh = await q([
      { type: 'date', path: 'postedAt', unit: 'weekday' },
      { type: 'date', path: 'postedAt', unit: 'hour' },
    ])
    expect(Object.fromEntries(wh.map((r) => [r.keys[0], [r.keys[1], r.keys[2]]]))).toEqual({
      y0: [null, null],
      d30: [null, null],
      d29: [null, null],
      o24: [null, null],
      o1430: [null, null],
      ok14: ['3', '20'], // 2024-02-28T20:00Z, a Wednesday
      okZ: ['1', '09'],
    })
    // Week needs only a real calendar day; an offset cannot make it fail.
    const wk = await q([{ type: 'date', path: 'postedAt', unit: 'week' }])
    expect(Object.fromEntries(wk.map((r) => [r.keys[0], r.keys[1]]))).toEqual({
      y0: null,
      d30: null,
      d29: null,
      o24: '2026-W09',
      o1430: '2026-W09',
      ok14: '2024-W09',
      okZ: '2026-W10',
    })
  })

  it('lists distinct values across several (type, path) reads in one query', async () => {
    await store.upsert('customer-support', 'zendesk', 'c2', 'tickets', 't1', {
      id: 't1',
      currency: 'CHF',
    })
    const values = await store.distinctValues([
      { connectionIds: ['c1'], vertical: 'accounting', resourceType: 'invoices', path: 'currency' },
      {
        connectionIds: ['c1', 'c2'],
        vertical: 'customer-support',
        resourceType: 'tickets',
        path: 'currency',
      },
    ])
    // c2's invoice has no currency; nulls are left out; sorted
    expect(values).toEqual(['CHF', 'EUR', 'USD'])
    expect(
      await store.distinctValues([
        {
          connectionIds: ['c2'],
          vertical: 'accounting',
          resourceType: 'invoices',
          path: 'currency',
        },
      ]),
    ).toEqual([])
    expect(await store.distinctValues([])).toEqual([])
    await expect(
      store.distinctValues([
        { connectionIds: ['c1'], vertical: 'accounting', resourceType: 'invoices', path: "x'--" },
      ]),
    ).rejects.toBeInstanceOf(ResourcePageError)
  })
})
