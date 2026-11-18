/**
 * Route4Me list paging. listShipments, listOrders and listTrackingEvents read
 * `params.offset`, which the router never sends, so every caller page asked
 * for offset 0 and page 2 repeated page 1.
 *
 * First-party docs, https://route4me.io/docs/ :
 *   Get Optimizations (GET /api.v4/optimization_problem.php):
 *     limit  "The number of records to return."
 *     offset "Search starting position"
 *     sample response (linked from that section) carries `totalRecords`.
 *   Get Orders, "d) Get the orders showing only specific fields" (GET /api.v4/order.php):
 *     offset "The number of records to skip before searching."
 *     limit  "The number of records to return."
 *     sample response carries `results` and `total`.
 *   Get Multiple Routes (GET /api.v4/route.php):
 *     offset "Search starting position"
 *     limit  "The number of records to return."
 *     sample response is a bare array of routes, each with its `addresses`.
 *
 * Tracking events are the destinations of routes, flattened, so one page of
 * routes is not one caller page: that method pages by rows over route pages.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  MAX_PAGE_LIMIT,
} from '@opensteward/shared'
import { Route4MeAdapter } from '../../../../../../src/verticals/logistics/adapters/route4me/index'

const CREDS = { accessToken: 'r4m_test_key' }
const OTHER = { accessToken: 'r4m_other_key' }
const CALL_BUDGET = 80
const L = 5
const N = 2 * L + 1

const DOCUMENTED: Record<string, Set<string>> = {
  'optimization_problem.php': new Set(['api_key', 'state', 'limit', 'offset']),
  'order.php': new Set(['api_key', 'fields', 'limit', 'offset']),
  'route.php': new Set(['api_key', 'limit', 'offset']),
}

interface Sizes {
  optimizations?: number
  orders?: number
  /** Destinations per route, in order. Each route also carries one depot. */
  routes?: number[]
}

/** Destination counts cycling 1, 2, 0 until exactly `n` destinations exist. */
function routeShape(n: number): number[] {
  const out: number[] = []
  const cycle = [1, 2, 0]
  let left = n
  for (let i = 0; left > 0; i++) {
    const c = Math.min(cycle[i % 3]!, left)
    out.push(c)
    left -= c
  }
  return out
}

const tag = (key: string) => (key === CREDS.accessToken ? '' : `${key}:`)

/**
 * A fake Route4Me that honours ONLY the documented query params of the three
 * list endpoints, and knows nothing of `page`. Each API key is its own account.
 */
function fakeRoute4Me(sizes: Sizes, perKey: Record<string, Sizes> = {}) {
  let calls = 0
  const log: Array<{ key: string; path: string; params: Record<string, unknown> }> = []

  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
    const params = Object.fromEntries(
      Object.entries(cfg?.params ?? {}).filter(([, v]) => v !== undefined),
    )
    const key = String(params.api_key)
    log.push({ key, path, params })
    const allowed = DOCUMENTED[path]
    if (!allowed) throw new Error(`unexpected path ${path}`)
    const bad = Object.keys(params).filter((k) => !allowed.has(k))
    if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
    const s = perKey[key] ?? sizes
    const offset = params.offset === undefined ? 0 : Number(params.offset)
    const limit = params.limit === undefined ? 10 : Number(params.limit)
    const window = <T>(rows: T[]) => rows.slice(offset, offset + limit)

    if (path === 'optimization_problem.php') {
      const rows = Array.from({ length: s.optimizations ?? 0 }, (_, i) => ({
        optimization_problem_id: `${tag(key)}opt${i + 1}`,
        state: 4,
      }))
      return { data: { optimizations: window(rows), totalRecords: rows.length } }
    }
    if (path === 'order.php') {
      const rows = Array.from({ length: s.orders ?? 0 }, (_, i) => ({
        order_id: `${tag(key)}ord${i + 1}`,
      }))
      return { data: { results: window(rows), total: rows.length } }
    }
    let d = 0
    const routes = (s.routes ?? []).map((count, r) => ({
      route_id: `${tag(key)}route${r + 1}`,
      addresses: [
        { route_destination_id: `${tag(key)}depot${r + 1}`, is_depot: true },
        ...Array.from({ length: count }, () => ({
          route_destination_id: `${tag(key)}d${++d}`,
          is_depot: false,
        })),
      ],
    }))
    return { data: window(routes) }
  })

  vi.spyOn(axios, 'create').mockImplementation((() => ({ get, post: vi.fn() })) as never)
  return { get, log }
}

const ids = (n: number, stem: string, prefix = '') =>
  Array.from({ length: n }, (_, i) => `${prefix}${stem}${i + 1}`)
const byId = (r: { id?: string }): string => r.id ?? '<no id>'
const sent = (c: unknown[]) => (c[1] as { params: Record<string, unknown> }).params

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

type Method = 'listShipments' | 'listOrders' | 'listTrackingEvents'
const CASES: Array<{ method: Method; stem: string; sizes: (n: number) => Sizes }> = [
  { method: 'listShipments', stem: 'opt', sizes: (n) => ({ optimizations: n }) },
  { method: 'listOrders', stem: 'ord', sizes: (n) => ({ orders: n }) },
  { method: 'listTrackingEvents', stem: 'd', sizes: (n) => ({ routes: routeShape(n) }) },
]

describe.each(CASES)('route4me $method paging', ({ method, stem, sizes }) => {
  const adapter = () => new Route4MeAdapter()
  const call = (creds: typeof CREDS, params: ReturnType<typeof withPageSink>) =>
    (adapter()[method] as (c: typeof CREDS, p: typeof params) => Promise<Array<{ id?: string }>>)(
      creds,
      params,
    )

  it('N = 2L+1 rows: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fakeRoute4Me(sizes(N))
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await call(CREDS, params)).map(byId))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(N, stem))
    expect(more).toEqual([true, true, false])
  })

  it('a sync-sized walk (limit 30 over 45 rows) crosses upstream pages', async () => {
    fakeRoute4Me(sizes(45))
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 2; k++) {
      const params = withPageSink({ page: k, limit: 30 })
      seen.push(...(await call(CREDS, params)).map(byId))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(45, stem))
    expect(more).toEqual([true, false])
  })

  it('a limit above the maximum is clamped by the router before it reaches Route4Me', async () => {
    const { get } = fakeRoute4Me(sizes(N))
    const params = parseListQuery({ page: '1', limit: '100000' })
    expect(params.limit).toBe(MAX_PAGE_LIMIT)
    const rows = await call(CREDS, params)
    expect(rows.map(byId)).toEqual(ids(N, stem))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    for (const c of get.mock.calls)
      expect(Number(sent(c).limit)).toBeLessThanOrEqual(MAX_PAGE_LIMIT)
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    fakeRoute4Me(sizes(N))
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await call(CREDS, params), params, 'route4me')
    expect(env.data.map(byId)).toEqual(ids(N, stem).slice(L, 2 * L))
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
  })

  it('a second connection never reuses the first connection’s rows', async () => {
    const { log } = fakeRoute4Me(sizes(N), { [OTHER.accessToken]: sizes(N) })
    await call(CREDS, withPageSink({ page: 1, limit: L }))
    const params = withPageSink({ page: 2, limit: L })
    const rows = await call(OTHER, params)
    expect(rows.map(byId)).toEqual(ids(N, stem, `${OTHER.accessToken}:`).slice(L, 2 * L))
    expect(log.some((c) => c.key === OTHER.accessToken)).toBe(true)
  })
})

describe('route4me page-2 requests carry the documented offset', () => {
  const adapter = () => new Route4MeAdapter()

  it('listShipments page 2 sends offset = L and limit = L', async () => {
    const { get } = fakeRoute4Me({ optimizations: N })
    await adapter().listShipments(CREDS, withPageSink({ page: 2, limit: L }))
    const last = get.mock.calls.at(-1)!
    expect(last[0]).toBe('optimization_problem.php')
    expect(sent(last)).toEqual(expect.objectContaining({ offset: L, limit: L, state: 4 }))
  })

  it('listShipments reports the documented totalRecords', async () => {
    fakeRoute4Me({ optimizations: N })
    const params = withPageSink({ page: 1, limit: L })
    await adapter().listShipments(CREDS, params)
    expect(readUpstreamPage(params)?.totalCount).toBe(N)
  })

  it('listOrders page 2 sends offset = L and limit = L, and reports the documented total', async () => {
    const { get } = fakeRoute4Me({ orders: N })
    const params = withPageSink({ page: 2, limit: L })
    await adapter().listOrders(CREDS, params)
    const last = get.mock.calls.at(-1)!
    expect(last[0]).toBe('order.php')
    expect(sent(last)).toEqual(expect.objectContaining({ offset: L, limit: L }))
    expect(readUpstreamPage(params)?.totalCount).toBe(N)
  })

  it('listTrackingEvents walks route pages by offset', async () => {
    // One destination per route: 45 routes, so rows past the first route page need offset > 0.
    const { get } = fakeRoute4Me({ routes: Array.from({ length: 45 }, () => 1) })
    const params = withPageSink({ page: 2, limit: 20 })
    const rows = await adapter().listTrackingEvents(CREDS, params)
    expect(rows.map(byId)).toEqual(ids(40, 'd').slice(20, 40))
    const offsets = get.mock.calls.filter((c) => c[0] === 'route.php').map((c) => sent(c).offset)
    expect(offsets.some((o) => Number(o) > 0)).toBe(true)
  })
})

/**
 * The documented sample responses always carry `totalRecords` / `total`, but
 * the adapter also accepts a response without it (and a bare array). Then only
 * a short page proves the end; a full page must never claim it.
 */
describe('route4me offset pages with no documented total', () => {
  type Shape = 'no-total' | 'bare'
  const respond = (shape: Shape, envelope: 'optimizations' | 'results', rows: unknown[]) =>
    shape === 'bare' ? rows : { [envelope]: rows }

  function fakeNoTotal(shape: Shape, n: number) {
    const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      const p = cfg?.params ?? {}
      const offset = Number(p.offset ?? 0)
      const limit = Number(p.limit ?? 10)
      const all = Array.from({ length: n }, (_, i) =>
        path === 'order.php'
          ? { order_id: `ord${i + 1}` }
          : { optimization_problem_id: `opt${i + 1}`, state: 4 },
      )
      const rows = all.slice(offset, offset + limit)
      return {
        data: respond(shape, path === 'order.php' ? 'results' : 'optimizations', rows),
      }
    })
    vi.spyOn(axios, 'create').mockImplementation((() => ({ get, post: vi.fn() })) as never)
  }

  const METHODS = ['listShipments', 'listOrders'] as const
  const SHAPES: Shape[] = ['no-total', 'bare']

  describe.each(METHODS.flatMap((method) => SHAPES.map((shape) => ({ method, shape }))))(
    '$method, $shape response',
    ({ method, shape }) => {
      const call = (params: ReturnType<typeof withPageSink>) =>
        (
          new Route4MeAdapter()[method] as (c: typeof CREDS, p: typeof params) => Promise<unknown[]>
        )(CREDS, params)

      it('a full page does not claim the end and reports no total', async () => {
        fakeNoTotal(shape, N)
        const params = withPageSink({ page: 1, limit: L })
        expect(await call(params)).toHaveLength(L)
        expect(readUpstreamPage(params)?.hasMore).not.toBe(false)
        expect(readUpstreamPage(params)?.totalCount).toBeUndefined()
      })

      it('a short page reports hasMore = false', async () => {
        fakeNoTotal(shape, N)
        const params = withPageSink({ page: 3, limit: L })
        expect(await call(params)).toHaveLength(1)
        expect(readUpstreamPage(params)?.hasMore).toBe(false)
      })
    },
  )
})
