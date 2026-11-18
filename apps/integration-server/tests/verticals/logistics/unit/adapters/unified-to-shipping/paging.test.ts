/**
 * Unified.to Shipping list paging. Every list method sent only `limit`, never
 * `offset`, so page 2 repeated page 1 and nothing past the first page could
 * be reached.
 *
 * First-party docs, https://docs.unified.to/reference/pagination:
 *
 *   "By default, most list endpoints return a maximum of 100 records per
 *   page. You can change the number of records on a per-request basis by
 *   passing a `limit` parameter ... However, you can't exceed 100 records per
 *   page on most endpoints. You will know that there aren't any more records,
 *   when the number of returned results is less than your requested `limit`."
 *
 *   "you can paginate through the records by padding a `offset` parameter
 *   that specifies the position of the first result. This parameter is
 *   zero-based regardless of integration's paging mechanism."
 *
 * GET /shipping/{connection_id}/shipment, /label, /carrier and /tracking all
 * take `limit` and `offset` (https://api.unified.to/openapi.json) and answer
 * a bare array with no count.
 *
 * listTrackingEvents flattens each tracking object's events, so one upstream
 * page is not one caller page: it goes through pageByRows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/logistics/adapters/unified-to-shipping/client', () => ({
  UnifiedToShippingClient: class {
    readonly connectionId: string
    constructor(creds: { extra?: { connectionId?: string } }) {
      this.connectionId = creds.extra?.connectionId ?? ''
    }
    get = (resource: string, params?: Record<string, unknown>) =>
      getMock(resource, params, this.connectionId)
  },
}))

import { UnifiedToShippingAdapter } from '../../../../../../src/verticals/logistics/adapters/unified-to-shipping'
import type { Credentials } from '../../../../../../src/verticals/logistics/adapter/interface'

const CREDS = { accessToken: 'TEST_key', extra: { connectionId: 'conn-1' } } as Credentials
const L = 5
const N = 2 * L + 1
const MAX = 100
const CALL_BUDGET = 400

const COMMON = ['limit', 'offset', 'updated_gte', 'sort', 'order', 'query', 'fields', 'raw']
const KEYS: Record<string, Set<string>> = {
  shipment: new Set([...COMMON, 'order_id', 'carrier_id', 'org_id']),
  label: new Set([...COMMON, 'shipment_id']),
  carrier: new Set(COMMON),
  tracking: new Set([...COMMON, 'order_id']),
}

const clean = (params?: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== undefined))

/** One page of a Unified.to list, honouring ONLY `limit` (default and max 100) and `offset`. */
function pagedBody(resource: string, rows: unknown[], params?: Record<string, unknown>) {
  const q = clean(params)
  const bad = Object.keys(q).filter((k) => !KEYS[resource]!.has(k))
  if (bad.length) throw new Error(`400: ${resource} undocumented params ${bad.join(',')}`)
  const limit = q.limit === undefined ? MAX : Number(q.limit)
  const offset = q.offset === undefined ? 0 : Number(q.offset)
  if (!(Number.isInteger(limit) && limit >= 1 && limit <= MAX))
    throw new Error(`400: limit ${limit}`)
  if (!(Number.isInteger(offset) && offset >= 0)) throw new Error(`400: offset ${offset}`)
  return rows.slice(offset, offset + limit)
}

interface Paged {
  name: string
  resource: string
  call: (a: UnifiedToShippingAdapter, p: QueryParams) => Promise<Array<{ id?: string }>>
}

const PAGED: Paged[] = [
  { name: 'listShipments', resource: 'shipment', call: (a, p) => a.listShipments(CREDS, p) },
  { name: 'listLabels', resource: 'label', call: (a, p) => a.listLabels(CREDS, p) },
  { name: 'listCarriers', resource: 'carrier', call: (a, p) => a.listCarriers(CREDS, p) },
]

function fakePaged(m: Paged, total: number) {
  let calls = 0
  const ids = Array.from({ length: total }, (_, i) => `u-${m.resource}-${i + 1}`)
  const rows = ids.map((id) => ({ id }))
  getMock.mockImplementation(async (resource: string, params?: Record<string, unknown>) => {
    if (++calls > CALL_BUDGET) throw new Error('call budget exceeded')
    if (resource !== m.resource) throw new Error(`404: ${resource}`)
    return pagedBody(resource, rows, params)
  })
  return ids
}

beforeEach(() => {
  getMock.mockReset()
  _resetRowPager()
})

describe('unified-to-shipping capabilities', () => {
  it('declares the documented 100-row page maximum', () => {
    expect(new UnifiedToShippingAdapter().capabilities?.maxPageSize).toBe(MAX)
  })
})

describe.each(PAGED)('unified-to-shipping $name paging', (m) => {
  it('serves every row once, in order, across pages 1..3 with exact hasMore', async () => {
    const expected = fakePaged(m, N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await m.call(new UnifiedToShippingAdapter(), params)
      seen.push(...rows.map((r) => r.id!))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(expected)
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request carries the documented limit and zero-based offset', async () => {
    fakePaged(m, N)
    await m.call(new UnifiedToShippingAdapter(), withPageSink({ page: 2, limit: L }))
    expect(getMock).toHaveBeenCalledTimes(1)
    const [resource, params] = getMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(resource).toBe(m.resource)
    expect(clean(params)).toEqual({ limit: L, offset: L })
  })

  it('a direct limit above the documented 100 is clamped and the size sent is reported', async () => {
    const expected = fakePaged(m, 250)
    const params = withPageSink({ page: 2, limit: 600 })
    const rows = await m.call(new UnifiedToShippingAdapter(), params)
    const sent = clean((getMock.mock.calls[0] as [string, Record<string, unknown>])[1])
    expect(sent).toEqual({ limit: MAX, offset: MAX })
    expect(rows.map((r) => r.id)).toEqual(expected.slice(MAX, 2 * MAX))
    expect(readUpstreamPage(params)).toEqual(
      expect.objectContaining({ hasMore: true, pageSize: MAX }),
    )
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    const expected = fakePaged(m, N)
    const adapter = new UnifiedToShippingAdapter()
    const params = parseListQuery({ page: '2', limit: String(L) }, adapter)
    const env = listPage(await m.call(adapter, params), params, 'unified-to-shipping')
    expect(env.data.map((r) => r.id)).toEqual(expected.slice(L, 2 * L))
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
  })

  it('the router caps the limit at the declared maximum', () => {
    const params = parseListQuery({ page: '1', limit: '500' }, new UnifiedToShippingAdapter())
    expect(params.limit).toBe(MAX)
  })
})

describe('unified-to-shipping listTrackingEvents paging (flattened over trackings)', () => {
  /**
   * Tracking objects holding exactly `total` events between them: tracking i
   * holds 1 + (i % 3) events (the last trimmed to hit `total`), so the event
   * stream is uneven across upstream pages.
   */
  function fakeTracking(total: number) {
    let calls = 0
    const rows: Array<{ id: string; events: Array<{ description: string }> }> = []
    const events: string[] = []
    for (let i = 1; events.length < total; i++) {
      const n = Math.min(1 + (i % 3), total - events.length)
      const evts = Array.from({ length: n }, (_, e) => ({ description: `trk-${i}#${e}` }))
      rows.push({ id: `trk-${i}`, events: evts })
      events.push(...evts.map((e) => e.description))
    }
    getMock.mockImplementation(async (resource: string, params?: Record<string, unknown>) => {
      if (++calls > CALL_BUDGET) throw new Error('call budget exceeded')
      if (resource !== 'tracking') throw new Error(`404: ${resource}`)
      return pagedBody(resource, rows, params)
    })
    return events
  }

  const describeEvent = (r: { description?: string }) => r.description!

  it('serves every event once, in order, across pages 1..3 with exact hasMore', async () => {
    const expected = fakeTracking(N)
    expect(expected).toHaveLength(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await new UnifiedToShippingAdapter().listTrackingEvents(CREDS, params)
      seen.push(...rows.map(describeEvent))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(expected)
    expect(more).toEqual([true, true, false])
  })

  it('walks forward by the documented offset across upstream tracking pages', async () => {
    const expected = fakeTracking(450)
    const seen: string[] = []
    let page = 1
    for (;;) {
      const params = withPageSink({ page, limit: 40 })
      const rows = await new UnifiedToShippingAdapter().listTrackingEvents(CREDS, params)
      seen.push(...rows.map(describeEvent))
      if (!readUpstreamPage(params)?.hasMore) break
      page++
    }
    expect(seen).toEqual(expected)
    const sent = getMock.mock.calls.map(([, q]) => clean(q as Record<string, unknown>))
    for (const q of sent) expect(q.limit).toBe(MAX)
    expect(sent.map((q) => q.offset ?? 0)).toEqual([0, 100, 200])
  })

  it('a direct limit above the documented 100 still sends at most 100 upstream', async () => {
    const expected = fakeTracking(700)
    const params = withPageSink({ page: 1, limit: 600 })
    const rows = await new UnifiedToShippingAdapter().listTrackingEvents(CREDS, params)
    expect(rows.map(describeEvent)).toEqual(expected.slice(0, 600))
    for (const [, q] of getMock.mock.calls) {
      expect((q as Record<string, unknown>).limit).toBe(MAX)
    }
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    const expected = fakeTracking(N)
    const adapter = new UnifiedToShippingAdapter()
    const params = parseListQuery({ page: '2', limit: String(L) }, adapter)
    const env = listPage(
      await adapter.listTrackingEvents(CREDS, params),
      params,
      'unified-to-shipping',
    )
    expect(env.data.map(describeEvent)).toEqual(expected.slice(L, 2 * L))
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
  })

  it('keeps walks of two connections apart', async () => {
    fakeTracking(N)
    const other = { ...CREDS, extra: { connectionId: 'conn-2' } } as Credentials
    const adapter = new UnifiedToShippingAdapter()
    await adapter.listTrackingEvents(CREDS, withPageSink({ page: 1, limit: L }))
    await adapter.listTrackingEvents(other, withPageSink({ page: 2, limit: L }))
    const conns = getMock.mock.calls.map(([, , c]) => c)
    expect(conns).toContain('conn-2')
  })

  it('keeps walks of one connection id under two different credentials apart', async () => {
    fakeTracking(N)
    const rotated = { ...CREDS, accessToken: 'TEST_other_key' } as Credentials
    const adapter = new UnifiedToShippingAdapter()
    await adapter.listTrackingEvents(CREDS, withPageSink({ page: 1, limit: L }))
    expect(getMock).toHaveBeenCalledTimes(1)
    await adapter.listTrackingEvents(rotated, withPageSink({ page: 2, limit: L }))
    // A fresh walk for the other credential, not page 2 cut from the first memo.
    expect(getMock).toHaveBeenCalledTimes(2)
  })

  it('keeps a filtered walk and an unfiltered walk apart', async () => {
    // The adapter's filter param is `updatedGte` (the documented name is
    // `updated_gte`; that mapping is out of scope here), so this fake accepts
    // it and narrows the trackings, to prove the filter is part of the key.
    const rows = Array.from({ length: 6 }, (_, i) => ({
      id: `trk-${i + 1}`,
      events: [{ description: `trk-${i + 1}#0` }],
    }))
    getMock.mockImplementation(async (resource: string, params?: Record<string, unknown>) => {
      if (resource !== 'tracking') throw new Error(`404: ${resource}`)
      const { updatedGte, ...rest } = clean(params)
      const source = updatedGte === undefined ? rows : rows.slice(0, 2)
      return pagedBody(resource, source, rest)
    })
    const adapter = new UnifiedToShippingAdapter()
    const filtered = await adapter.listTrackingEvents(
      CREDS,
      withPageSink({ page: 1, limit: 2, updatedAfter: new Date('2026-01-01T00:00:00Z') }),
    )
    expect(filtered.map(describeEvent)).toEqual(['trk-1#0', 'trk-2#0'])
    const unfiltered = await adapter.listTrackingEvents(CREDS, withPageSink({ page: 2, limit: 2 }))
    expect(unfiltered.map(describeEvent)).toEqual(['trk-3#0', 'trk-4#0'])
    const second = clean(getMock.mock.calls[1]![1] as Record<string, unknown>)
    expect(second).not.toHaveProperty('updatedGte')
  })

  it('a direct call without a limit serves the adapter default of 20 events', async () => {
    const expected = fakeTracking(150)
    const rows = await new UnifiedToShippingAdapter().listTrackingEvents(
      CREDS,
      withPageSink({ page: 1 }),
    )
    expect(rows.map(describeEvent)).toEqual(expected.slice(0, 20))
  })
})
