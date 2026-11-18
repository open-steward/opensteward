/**
 * ShipEngine list paging. Every list method always sent `page=1` (or no
 * paging params at all), so page 2 repeated page 1 and nothing past the first
 * page could be reached.
 *
 * First-party spec: ShipEngine's OpenAPI document,
 * https://raw.githubusercontent.com/ShipEngine/shipengine-openapi/master/openapi.json
 *
 *   GET /v1/shipments, /v1/labels, /v1/manifests take
 *     page:      "Return a specific page of results. Defaults to the first
 *                page. If set to a number that's greater than the number of
 *                pages of results, an empty page is returned." (minimum 1)
 *     page_size: "The number of results to return per response." (minimum 1,
 *                default 25, no maximum documented)
 *   and answer `total`, `page` and `pages`, where pages is "The total number
 *   of pages of results. ... If there are no results, then `pages` will be
 *   zero."
 *
 *   GET /v1/carriers ("List all carriers that have been added to this
 *   account") and GET /v1/warehouses take no parameters at all: each answers
 *   the whole collection, so they are paged locally.
 *
 *   listTrackingEvents flattens GET /v1/tracking over pages of shipments, so
 *   one upstream page is not one caller page: it goes through pageByRows.
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

vi.mock('../../../../../../src/verticals/logistics/adapters/shipengine/client', () => ({
  // The API key travels with each request, so a fake can answer per connection.
  ShipEngineClient: class {
    constructor(private readonly creds: { accessToken?: string }) {}
    get = (path: string, params?: Record<string, unknown>) =>
      getMock(path, params, this.creds.accessToken)
  },
}))

import { ShipEngineAdapter } from '../../../../../../src/verticals/logistics/adapters/shipengine'
import type { Credentials } from '../../../../../../src/verticals/logistics/adapter/interface'

const CREDS = { accessToken: 'TEST_key' } as Credentials
const L = 5
const N = 2 * L + 1
/**
 * The router's global page cap (MAX_PAGE_LIMIT). ShipEngine documents no
 * maximum, so the adapter declares no maxPageSize and parseListQuery applies
 * only this cap: the API-path tests call it without an adapter to match.
 */
const ROUTER_MAX = 500
const DEFAULT_PAGE_SIZE = 25
const CALL_BUDGET = 400

const SHIPMENT_KEYS = new Set([
  'shipment_status',
  'batch_id',
  'tag',
  'created_at_start',
  'created_at_end',
  'modified_at_start',
  'modified_at_end',
  'page',
  'page_size',
  'sales_order_id',
  'sort_dir',
  'sort_by',
])
const LABEL_KEYS = new Set([
  'label_status',
  'service_code',
  'carrier_id',
  'tracking_number',
  'batch_id',
  'rate_id',
  'shipment_id',
  'warehouse_id',
  'created_at_start',
  'created_at_end',
  'refund_status',
  'page',
  'page_size',
  'sort_dir',
  'sort_by',
])
const MANIFEST_KEYS = new Set([
  'warehouse_id',
  'ship_date_start',
  'ship_date_end',
  'created_at_start',
  'created_at_end',
  'carrier_id',
  'page',
  'page_size',
  'label_ids',
])
const TRACKING_KEYS = new Set(['carrier_code', 'tracking_number', 'carrier_id'])

const clean = (params?: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== undefined))

function assertKeys(path: string, q: Record<string, unknown>, allowed: Set<string>) {
  const bad = Object.keys(q).filter((k) => !allowed.has(k))
  if (bad.length) throw new Error(`400: ${path} undocumented params ${bad.join(',')}`)
}

/** One page of a paged ShipEngine list, honouring ONLY `page` and `page_size`. */
function pagedBody(key: string, rows: unknown[], q: Record<string, unknown>) {
  const page = q.page === undefined ? 1 : Number(q.page)
  const size = q.page_size === undefined ? DEFAULT_PAGE_SIZE : Number(q.page_size)
  if (!(Number.isInteger(page) && page >= 1)) throw new Error(`400: page ${page}`)
  if (!(Number.isInteger(size) && size >= 1)) throw new Error(`400: page_size ${size}`)
  const start = (page - 1) * size
  const pages = Math.ceil(rows.length / size)
  return { [key]: rows.slice(start, start + size), total: rows.length, page, pages, links: {} }
}

interface Paged {
  name: string
  path: string
  key: string
  idField: string
  allowed: Set<string>
  call: (a: ShipEngineAdapter, p: QueryParams) => Promise<Array<{ id?: string }>>
}

const PAGED: Paged[] = [
  {
    name: 'listShipments',
    path: '/shipments',
    key: 'shipments',
    idField: 'shipment_id',
    allowed: SHIPMENT_KEYS,
    call: (a, p) => a.listShipments(CREDS, p),
  },
  {
    name: 'listLabels',
    path: '/labels',
    key: 'labels',
    idField: 'label_id',
    allowed: LABEL_KEYS,
    call: (a, p) => a.listLabels(CREDS, p),
  },
  {
    name: 'listManifests',
    path: '/manifests',
    key: 'manifests',
    idField: 'manifest_id',
    allowed: MANIFEST_KEYS,
    call: (a, p) => a.listManifests(CREDS, p),
  },
]

function fakePaged(m: Paged, total: number) {
  let calls = 0
  const ids = Array.from({ length: total }, (_, i) => `se-${m.key}-${i + 1}`)
  const rows = ids.map((id) => ({ [m.idField]: id }))
  getMock.mockImplementation(async (path: string, params?: Record<string, unknown>) => {
    if (++calls > CALL_BUDGET) throw new Error('call budget exceeded')
    if (path !== m.path) throw new Error(`404: ${path}`)
    const q = clean(params)
    assertKeys(path, q, m.allowed)
    return pagedBody(m.key, rows, q)
  })
  return ids
}

beforeEach(() => {
  getMock.mockReset()
  _resetRowPager()
})

describe.each(PAGED)('shipengine $name paging', (m) => {
  it('serves every row once, in order, across pages 1..3 with exact hasMore', async () => {
    const expected = fakePaged(m, N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await m.call(new ShipEngineAdapter(), params)
      seen.push(...rows.map((r) => r.id!))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(expected)
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request carries the documented page and page_size', async () => {
    fakePaged(m, N)
    await m.call(new ShipEngineAdapter(), withPageSink({ page: 2, limit: L }))
    expect(getMock).toHaveBeenCalledTimes(1)
    const [path, params] = getMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(path).toBe(m.path)
    expect(params).toEqual(expect.objectContaining({ page: 2, page_size: L }))
  })

  it('reports the total ShipEngine counts', async () => {
    fakePaged(m, N)
    const params = withPageSink({ page: 1, limit: L })
    await m.call(new ShipEngineAdapter(), params)
    expect(readUpstreamPage(params)?.totalCount).toBe(N)
  })

  it('a direct limit above the router cap is clamped and the size sent is reported', async () => {
    const expected = fakePaged(m, 700)
    const params = withPageSink({ page: 2, limit: 600 })
    const rows = await m.call(new ShipEngineAdapter(), params)
    const sent = (getMock.mock.calls[0] as [string, Record<string, unknown>])[1]
    expect(sent).toEqual(expect.objectContaining({ page: 2, page_size: ROUTER_MAX }))
    expect(rows.map((r) => r.id)).toEqual(expected.slice(ROUTER_MAX))
    expect(readUpstreamPage(params)).toEqual(
      expect.objectContaining({ hasMore: false, pageSize: ROUTER_MAX }),
    )
  })

  it('the router caps the limit at its global maximum', () => {
    const params = parseListQuery({ page: '1', limit: '100000' })
    expect(params.limit).toBe(ROUTER_MAX)
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    const expected = fakePaged(m, N)
    const adapter = new ShipEngineAdapter()
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await m.call(adapter, params), params, 'shipengine')
    expect(env.data.map((r) => r.id)).toEqual(expected.slice(L, 2 * L))
    expect(env.meta).toEqual(
      expect.objectContaining({ page: 2, limit: L, hasMore: true, totalCount: N }),
    )
  })
})

interface Whole {
  name: string
  path: string
  key: string
  idField: string
  call: (a: ShipEngineAdapter, p: QueryParams) => Promise<Array<{ id?: string }>>
}

const WHOLE: Whole[] = [
  {
    name: 'listCarriers',
    path: '/carriers',
    key: 'carriers',
    idField: 'carrier_id',
    call: (a, p) => a.listCarriers(CREDS, p),
  },
  {
    name: 'listWarehouses',
    path: '/warehouses',
    key: 'warehouses',
    idField: 'warehouse_id',
    call: (a, p) => a.listWarehouses(CREDS, p),
  },
]

/** An unpaginated ShipEngine list: no query params documented, every row in one answer. */
function fakeWhole(m: Whole, total: number) {
  const ids = Array.from({ length: total }, (_, i) => `se-${m.key}-${i + 1}`)
  getMock.mockImplementation(async (path: string, params?: Record<string, unknown>) => {
    if (path !== m.path) throw new Error(`404: ${path}`)
    assertKeys(path, clean(params), new Set())
    return { [m.key]: ids.map((id) => ({ [m.idField]: id })) }
  })
  return ids
}

describe.each(WHOLE)('shipengine $name paging (unpaginated upstream)', (m) => {
  it('serves every row once, in order, across pages 1..3 with exact hasMore', async () => {
    const expected = fakeWhole(m, N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await m.call(new ShipEngineAdapter(), params)
      seen.push(...rows.map((r) => r.id!))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(expected)
    expect(more).toEqual([true, true, false])
  })

  it('sends no paging params, which the endpoint does not document', async () => {
    fakeWhole(m, N)
    await m.call(new ShipEngineAdapter(), withPageSink({ page: 2, limit: L }))
    expect(getMock).toHaveBeenCalledTimes(1)
    expect(clean((getMock.mock.calls[0] as [string, Record<string, unknown>?])[1])).toEqual({})
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    const expected = fakeWhole(m, N)
    const adapter = new ShipEngineAdapter()
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await m.call(adapter, params), params, 'shipengine')
    expect(env.data.map((r) => r.id)).toEqual(expected.slice(L, 2 * L))
    expect(env.meta).toEqual(
      expect.objectContaining({ page: 2, limit: L, hasMore: true, totalCount: N }),
    )
  })
})

describe('shipengine listTrackingEvents paging (flattened over shipments)', () => {
  /**
   * Shipments holding exactly `total` tracking events between them. Every
   * fourth shipment has no tracking number, and shipment i's tracking answer
   * holds 1 + (i % 3) events (the last one trimmed to hit `total`), so the
   * event stream is uneven across upstream pages.
   */
  function fakeTracking(total: number) {
    let calls = 0
    const rows: Array<{
      shipment_id: string
      tracking_number: string | null
      carrier_code: string
    }> = []
    const counts = new Map<string, number>()
    const events: string[] = []
    for (let i = 1; events.length < total; i++) {
      const tn = i % 4 === 0 ? null : `TN${i}`
      rows.push({ shipment_id: `se-sh-${i}`, tracking_number: tn, carrier_code: 'ups' })
      if (!tn) continue
      const n = Math.min(1 + (i % 3), total - events.length)
      counts.set(tn, n)
      for (let e = 0; e < n; e++) events.push(`${tn}#${e}`)
    }
    getMock.mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (++calls > CALL_BUDGET) throw new Error('call budget exceeded')
      const q = clean(params)
      if (path === '/shipments') {
        assertKeys(path, q, SHIPMENT_KEYS)
        return pagedBody('shipments', rows, q)
      }
      if (path === '/tracking') {
        assertKeys(path, q, TRACKING_KEYS)
        const tn = String(q.tracking_number)
        return {
          tracking_number: tn,
          status_code: 'IT',
          events: Array.from({ length: counts.get(tn) ?? 0 }, (_, e) => ({
            description: `${tn}#${e}`,
            status_code: 'IT',
          })),
        }
      }
      throw new Error(`404: ${path}`)
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
      const rows = await new ShipEngineAdapter().listTrackingEvents(CREDS, params)
      seen.push(...rows.map(describeEvent))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(expected)
    expect(more).toEqual([true, true, false])
  })

  it('walks forward with the documented page param across upstream shipment pages', async () => {
    const expected = fakeTracking(120)
    const seen: string[] = []
    let page = 1
    for (;;) {
      const params = withPageSink({ page, limit: 7 })
      const rows = await new ShipEngineAdapter().listTrackingEvents(CREDS, params)
      seen.push(...rows.map(describeEvent))
      if (!readUpstreamPage(params)?.hasMore) break
      page++
    }
    expect(seen).toEqual(expected)
    const shipmentPages = getMock.mock.calls
      .filter(([p]) => p === '/shipments')
      .map(([, q]) => (q as Record<string, unknown>).page)
    expect(shipmentPages).toContain(2)
    expect(shipmentPages).toContain(3)
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    const expected = fakeTracking(N)
    const adapter = new ShipEngineAdapter()
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter.listTrackingEvents(CREDS, params), params, 'shipengine')
    expect(env.data.map(describeEvent)).toEqual(expected.slice(L, 2 * L))
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
  })

  it('fills one caller page from several upstream shipment pages at the documented default size', async () => {
    const expected = fakeTracking(120)
    const params = withPageSink({ page: 1, limit: 60 })
    const rows = await new ShipEngineAdapter().listTrackingEvents(CREDS, params)
    expect(rows.map(describeEvent)).toEqual(expected.slice(0, 60))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    const shipmentCalls = getMock.mock.calls.filter(([p]) => p === '/shipments')
    expect(shipmentCalls.length).toBeGreaterThan(1)
    for (const [, q] of shipmentCalls) {
      expect((q as Record<string, unknown>).page_size).toBe(DEFAULT_PAGE_SIZE)
    }
  })

  it('never asks for a shipment page past the last one ShipEngine reports', async () => {
    fakeTracking(120)
    let page = 1
    for (;;) {
      const params = withPageSink({ page, limit: 7 })
      await new ShipEngineAdapter().listTrackingEvents(CREDS, params)
      if (!readUpstreamPage(params)?.hasMore) break
      page++
    }
    const shipmentCalls = getMock.mock.calls.filter(([p]) => p === '/shipments')
    const requested = shipmentCalls.map(([, q]) => Number((q as Record<string, unknown>).page))
    const first = (await getMock('/shipments', { page: 1, page_size: DEFAULT_PAGE_SIZE })) as {
      pages: number
    }
    expect(Math.max(...requested)).toBe(first.pages)
  })

  it('keeps each connection on its own walk: two API keys never share cached rows', async () => {
    const rowsFor = (key: string) =>
      Array.from({ length: 40 }, (_, i) => ({
        shipment_id: `${key}-sh-${i + 1}`,
        tracking_number: `${key}-TN${i + 1}`,
        carrier_code: 'ups',
      }))
    const eventsFor = (key: string) => rowsFor(key).map((r) => `${r.tracking_number}#0`)
    getMock.mockImplementation(
      async (path: string, params: Record<string, unknown> | undefined, apiKey: string) => {
        const q = clean(params)
        if (path === '/shipments') {
          assertKeys(path, q, SHIPMENT_KEYS)
          return pagedBody('shipments', rowsFor(apiKey), q)
        }
        if (path === '/tracking') {
          assertKeys(path, q, TRACKING_KEYS)
          const tn = String(q.tracking_number)
          if (!tn.startsWith(`${apiKey}-`)) throw new Error(`404: ${tn} not on ${apiKey}`)
          return { tracking_number: tn, events: [{ description: `${tn}#0`, status_code: 'IT' }] }
        }
        throw new Error(`404: ${path}`)
      },
    )
    const credsA = { accessToken: 'KEY_A' } as Credentials
    const credsB = { accessToken: 'KEY_B' } as Credentials
    const read = (c: Credentials, page: number) =>
      new ShipEngineAdapter().listTrackingEvents(c, withPageSink({ page, limit: L }))
    const a1 = await read(credsA, 1)
    const b2 = await read(credsB, 2)
    const a2 = await read(credsA, 2)
    expect(a1.map(describeEvent)).toEqual(eventsFor('KEY_A').slice(0, L))
    expect(b2.map(describeEvent)).toEqual(eventsFor('KEY_B').slice(L, 2 * L))
    expect(a2.map(describeEvent)).toEqual(eventsFor('KEY_A').slice(L, 2 * L))
  })
})

describe('shipengine unpaginated lists page the whole collection', () => {
  it.each(WHOLE)('$name serves the last page of 600 rows at the router cap', async (m) => {
    const expected = fakeWhole(m, 600)
    const params = withPageSink({ page: 2, limit: ROUTER_MAX })
    const rows = await m.call(new ShipEngineAdapter(), params)
    expect(rows.map((r) => r.id)).toEqual(expected.slice(ROUTER_MAX))
    expect(readUpstreamPage(params)).toEqual(
      expect.objectContaining({ hasMore: false, pagedLocally: true }),
    )
  })
})

describe('shipengine listShipments incremental filter', () => {
  it('forwards updatedAfter as the documented modified_at_start', async () => {
    fakePaged(PAGED[0], N)
    const since = new Date('2026-01-02T03:04:05.000Z')
    await new ShipEngineAdapter().listShipments(
      CREDS,
      withPageSink({ page: 1, limit: L, updatedAfter: since }),
    )
    const sent = (getMock.mock.calls[0] as [string, Record<string, unknown>])[1]
    expect(sent.modified_at_start).toBe(since.toISOString())
  })
})
