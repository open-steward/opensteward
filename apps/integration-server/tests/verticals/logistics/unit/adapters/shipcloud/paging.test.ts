/**
 * shipcloud list paging. listShipments and listTrackingEvents sent only
 * `per_page`, listOrders and listCarriers nothing, so page 2 repeated page 1.
 *
 * First-party source, https://developers.shipcloud.io/reference/ ("Getting a
 * list of shipments", GET /v1/shipments):
 *   page , show page number x, e.g. 'page=2'
 *   per_page , show x number of shipments on a page (default & max: 100), e.g. 'per_page=25'
 * No next-page signal (Link header, total, next) is documented, so a page
 * shorter than `per_page` is the last one. listShipments reads upstream pages
 * of min(limit, 100) and listTrackingEvents, which flattens events out of
 * shipments, reads pages of 100; both cut the caller's rows with pageByRows.
 *
 * GET /v1/carriers ("Get all carriers available for your account") and
 * GET /v1/orders ("Getting a list of previously created orders") document no
 * paging parameters (the OpenAPI spec lists only filters on /orders), so both
 * are sliced locally from the whole list.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'
import { ShipcloudAdapter } from '../../../../../../src/verticals/logistics/adapters/shipcloud/index'

const CREDS = { accessToken: 'key-a' }
const OTHER = { accessToken: 'key-b' }
const CALL_BUDGET = 60
const MAX = 100
const L = 5
const N = 2 * L + 1
const SHIPMENT_KEYS = new Set(['page', 'per_page'])

type Row = Record<string, unknown>

/**
 * A fake shipcloud that honours ONLY the documented `page` and `per_page`
 * (defaults 1 and 100, max 100) on /shipments, and serves /orders and
 * /carriers whole. Each API key is its own account.
 */
function fakeShipcloud(
  count: number,
  opts: { perKey?: Record<string, number>; eventsPerShipment?: (i: number) => number } = {},
) {
  let calls = 0
  const log: Array<{ key: string; path: string; params: Record<string, unknown> }> = []

  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
    const auth = (instanceHeaders.Authorization ?? '').replace(/^Basic /, '')
    const key = Buffer.from(auth, 'base64').toString().replace(/:$/, '')
    const params = Object.fromEntries(
      Object.entries(cfg?.params ?? {}).filter(([, v]) => v !== undefined),
    )
    log.push({ key, path, params })
    const n = opts.perKey?.[key] ?? count
    const tag = key === CREDS.accessToken ? '' : `${key}:`
    if (path === 'shipments') {
      const bad = Object.keys(params).filter((k) => !SHIPMENT_KEYS.has(k))
      if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
      const perPage = Math.min(params.per_page === undefined ? MAX : Number(params.per_page), MAX)
      const page = params.page === undefined ? 1 : Number(params.page)
      const rows: Row[] = Array.from({ length: n }, (_, i) => ({
        id: `${tag}s${i + 1}`,
        carrier: 'dhl',
        packages: [
          {
            weight: 1,
            length: null,
            width: null,
            height: null,
            tracking_events: Array.from({ length: opts.eventsPerShipment?.(i) ?? 1 }, (_, e) => ({
              id: `e${e}`,
              timestamp: '2026-01-01T00:00:00Z',
              status: 'transit',
              details: `${tag}s${i + 1}/e${e + 1}`,
            })),
          },
        ],
      }))
      return { data: { shipments: rows.slice((page - 1) * perPage, page * perPage) } }
    }
    if (Object.keys(params).length) throw new Error(`400: undocumented params on ${path}`)
    if (path === 'orders')
      return { data: Array.from({ length: n }, (_, i) => ({ id: `${tag}o${i + 1}` })) }
    if (path === 'carriers')
      return { data: Array.from({ length: n }, (_, i) => ({ name: `${tag}c${i + 1}` })) }
    throw new Error(`unexpected path ${path}`)
  })

  let instanceHeaders: Record<string, string> = {}
  vi.spyOn(axios, 'create').mockImplementation(((cfg: { headers: Record<string, string> }) => {
    const headers = cfg.headers
    return {
      get: (path: string, c?: { params?: Record<string, unknown> }) => {
        instanceHeaders = headers
        return get(path, c)
      },
      post: vi.fn(),
      delete: vi.fn(),
    }
  }) as never)
  return { get, log }
}

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)
const byId = (r: { id?: string }): string => r.id ?? '<no id>'
const byDesc = (r: { description?: string }): string => r.description ?? '<none>'
const sentParams = (c: unknown[]) =>
  ((c[1] ?? {}) as { params?: Record<string, unknown> }).params ?? {}

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

const adapter = () => new ShipcloudAdapter()

describe('shipcloud listShipments paging (GET /v1/shipments)', () => {
  it('N = 2L+1 rows: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fakeShipcloud(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await adapter().listShipments(CREDS, params)).map(byId))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids('s', N))
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request carries the documented `page` key and `per_page`', async () => {
    const { get } = fakeShipcloud(N)
    const rows = await adapter().listShipments(CREDS, withPageSink({ page: 2, limit: L }))
    expect(rows.map(byId)).toEqual(ids('s', N).slice(L, 2 * L))
    const page2 = get.mock.calls.filter((c) => sentParams(c).page === 2)
    expect(page2.length).toBeGreaterThanOrEqual(1)
    expect(page2[0]![0]).toBe('shipments')
    expect(sentParams(page2[0]!)).toEqual({ page: 2, per_page: L })
  })

  it('a limit above the maximum is clamped to per_page=100 and still serves exactly `limit` rows', async () => {
    const { get } = fakeShipcloud(450)
    const params = withPageSink({ page: 2, limit: 150 })
    const rows = await adapter().listShipments(CREDS, params)
    expect(rows.map(byId)).toEqual(ids('s', 450).slice(150, 300))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    for (const c of get.mock.calls) expect(sentParams(c).per_page).toBe(MAX)
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    fakeShipcloud(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter().listShipments(CREDS, params), params, 'shipcloud')
    expect(env.data.map(byId)).toEqual(ids('s', N).slice(L, 2 * L))
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
  })

  it('a second API key never reuses the first key’s rows', async () => {
    const { log } = fakeShipcloud(N)
    await adapter().listShipments(CREDS, withPageSink({ page: 1, limit: L }))
    const rows = await adapter().listShipments(OTHER, withPageSink({ page: 2, limit: L }))
    expect(rows.map(byId)).toEqual(ids(`${OTHER.accessToken}:s`, N).slice(L, 2 * L))
    expect(log.filter((c) => c.key === OTHER.accessToken).length).toBeGreaterThan(0)
  })

  it('changing the limit mid-walk on one connection never reuses offsets from the other page size', async () => {
    fakeShipcloud(40)
    for (let k = 1; k <= 2; k++) {
      await adapter().listShipments(CREDS, withPageSink({ page: k, limit: L }))
    }
    const rows = await adapter().listShipments(CREDS, withPageSink({ page: 2, limit: 10 }))
    expect(rows.map(byId)).toEqual(ids('s', 40).slice(10, 20))
    const again = await adapter().listShipments(CREDS, withPageSink({ page: 3, limit: L }))
    expect(again.map(byId)).toEqual(ids('s', 40).slice(2 * L, 3 * L))
  })

  it('with no limit, serves pages of 25 (the adapter default)', async () => {
    const { get } = fakeShipcloud(60)
    const params = withPageSink({ page: 2 })
    const rows = await adapter().listShipments(CREDS, params)
    expect(rows.map(byId)).toEqual(ids('s', 60).slice(25, 50))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    for (const c of get.mock.calls) expect(sentParams(c).per_page).toBe(25)
  })
})

describe('shipcloud listTrackingEvents paging (events flattened from GET /v1/shipments)', () => {
  const desc = (n: number) => Array.from({ length: n }, (_, i) => `s${i + 1}/e1`)

  it('N = 2L+1 events: pages 1..3 at limit L return every event once, in order, with exact hasMore', async () => {
    fakeShipcloud(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await adapter().listTrackingEvents(CREDS, params)).map(byDesc))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(desc(N))
    expect(more).toEqual([true, true, false])
  })

  it('walks upstream pages of 100 shipments by the documented `page` key', async () => {
    const total = 2 * MAX + 1
    const { get } = fakeShipcloud(total)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: MAX })
      seen.push(...(await adapter().listTrackingEvents(CREDS, params)).map(byDesc))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(desc(total))
    expect(more).toEqual([true, true, false])
    expect(get.mock.calls.map((c) => sentParams(c))).toEqual([
      { page: 1, per_page: MAX },
      { page: 2, per_page: MAX },
      { page: 3, per_page: MAX },
    ])
  })

  it('shipments holding several or no events still serve exactly `limit` events per page', async () => {
    fakeShipcloud(6, { eventsPerShipment: (i) => [3, 0, 2, 0, 1, 4][i]! })
    const all: string[] = []
    for (let k = 1; k <= 4; k++) {
      const rows = await adapter().listTrackingEvents(CREDS, withPageSink({ page: k, limit: 3 }))
      expect(rows.length).toBe(k < 4 ? 3 : 1)
      all.push(...rows.map(byDesc))
    }
    expect(all).toEqual([
      's1/e1',
      's1/e2',
      's1/e3',
      's3/e1',
      's3/e2',
      's5/e1',
      's6/e1',
      's6/e2',
      's6/e3',
      's6/e4',
    ])
  })

  it('a full page of 100 shipments holding fewer than 100 events does not end the walk', async () => {
    // One event on every 4th shipment: 25 events per upstream page of 100.
    const total = 2 * MAX + 1
    const { get } = fakeShipcloud(total, { eventsPerShipment: (i) => (i % 4 === 0 ? 1 : 0) })
    const params = withPageSink({ page: 1, limit: MAX })
    const rows = await adapter().listTrackingEvents(CREDS, params)
    const want = Array.from({ length: total }, (_, i) => i)
      .filter((i) => i % 4 === 0)
      .map((i) => `s${i + 1}/e1`)
    expect(rows.map(byDesc)).toEqual(want)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(get.mock.calls.map((c) => sentParams(c).page)).toEqual([1, 2, 3])
  })

  it('reads shipments at per_page=100 whatever the caller limit, and survives a limit change', async () => {
    const { get } = fakeShipcloud(40)
    for (let k = 1; k <= 2; k++) {
      await adapter().listTrackingEvents(CREDS, withPageSink({ page: k, limit: L }))
    }
    const rows = await adapter().listTrackingEvents(CREDS, withPageSink({ page: 2, limit: 10 }))
    expect(rows.map(byDesc)).toEqual(desc(40).slice(10, 20))
    for (const c of get.mock.calls) expect(sentParams(c).per_page).toBe(MAX)
  })

  it('never shares a pager slot with listShipments on the same connection', async () => {
    // Two events per shipment, so the two streams' row offsets differ; both
    // read pages of per_page=100, so a shared key would mix their rows.
    const total = 2 * MAX + 1
    fakeShipcloud(total, { eventsPerShipment: () => 2 })
    const ships: string[] = []
    const events: string[] = []
    for (let k = 1; k <= 5; k++) {
      if (k <= 3) {
        const s = await adapter().listShipments(CREDS, withPageSink({ page: k, limit: MAX }))
        ships.push(...s.map(byId))
      }
      const e = await adapter().listTrackingEvents(CREDS, withPageSink({ page: k, limit: MAX }))
      events.push(...e.map(byDesc))
    }
    expect(ships).toEqual(ids('s', total))
    expect(events).toEqual(
      Array.from({ length: total }, (_, i) => [`s${i + 1}/e1`, `s${i + 1}/e2`]).flat(),
    )
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 3 with exact meta', async () => {
    fakeShipcloud(N)
    const params = parseListQuery({ page: '3', limit: String(L) })
    const env = listPage(await adapter().listTrackingEvents(CREDS, params), params, 'shipcloud')
    expect(env.data.map(byDesc)).toEqual(desc(N).slice(2 * L))
    expect(env.meta).toEqual(expect.objectContaining({ page: 3, limit: L, hasMore: false }))
  })
})

describe.each([
  ['listOrders', 'orders', 'o'],
  ['listCarriers', 'carriers', 'c'],
] as const)('shipcloud %s paging (GET /v1/%s, returned whole)', (method, path, prefix) => {
  const call = (creds: typeof CREDS, params: ReturnType<typeof withPageSink>) =>
    (adapter()[method] as (c: typeof CREDS, p: typeof params) => Promise<Array<{ id?: string }>>)(
      creds,
      params,
    )

  it('N = 2L+1 rows: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fakeShipcloud(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await call(CREDS, params)).map(byId))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
    }
    expect(seen).toEqual(ids(prefix, N))
    expect(more).toEqual([true, true, false])
  })

  it('sends no paging parameters (none are documented)', async () => {
    const { get } = fakeShipcloud(N)
    await call(CREDS, withPageSink({ page: 2, limit: L }))
    expect(get.mock.calls).toHaveLength(1)
    expect(get.mock.calls[0]![0]).toBe(path)
    expect(sentParams(get.mock.calls[0]!)).toEqual({})
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    fakeShipcloud(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await call(CREDS, params), params, 'shipcloud')
    expect(env.data.map(byId)).toEqual(ids(prefix, N).slice(L, 2 * L))
    expect(env.meta).toEqual(
      expect.objectContaining({ page: 2, limit: L, hasMore: true, totalCount: N }),
    )
  })
})
