/**
 * Nash list paging, against the first-party OpenAPI shipped with each
 * reference page:
 *
 * listOrders — GET /v1/orders
 *   https://docs.usenash.com/api-reference/order/listsearch-orders.md
 *   "List orders with filters, sorting, and pagination."
 *   `limit` ("maximum: 100 minimum: 1 type: integer default: 25") and
 *   `offset` ("minimum: 0 type: integer default: 0"); the response is
 *   `OrdersListResponse` with required `results`, `totalCount`, `limit`,
 *   `offset`.
 *
 * listWarehouses — GET /v1/store_locations
 *   https://docs.usenash.com/api-reference/store-locations/get-store-locations.md
 *   "List store locations for the organization with pagination. Use size and
 *   offset parameters to paginate through results." — `size` (default 10) and
 *   `offset` (default 0); the response is `ListStoreLocationsResponse` with a
 *   required `storeLocations` array and no total.
 *
 * listCarriers — GET /v1/providers
 *   https://docs.usenash.com/api-reference/provider/get-providers.md
 *   "List all delivery providers configured for the organization" — no
 *   parameters; the response is a bare array.
 *
 * Before this, orders sent `size` (not an orders parameter) and every list
 * sent offset 0 on every page, so page 2 repeated page 1.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { NashAdapter } from '../../../../../../src/verticals/logistics/adapters/nash/index'

const CREDS = { accessToken: 'nash_test' }
const CALL_BUDGET = 20
const ORDERS_MAX = 100
const ORDERS_DEFAULT = 25
const STORES_DEFAULT = 10

const orders = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `ord_${String(i + 1).padStart(3, '0')}`,
    status: 'valid',
  }))
const stores = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `stl_${String(i + 1).padStart(3, '0')}`,
    name: `Store ${i + 1}`,
    phoneNumber: '+1',
    location: {},
  }))
const providers = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ providerId: `prv_${i + 1}`, name: `Provider ${i + 1}` }))

/**
 * A fake Nash honouring ONLY the documented parameters of each list endpoint:
 * orders take `limit` (1..100, default 25) and `offset`; store locations take
 * `size` (default 10) and `offset`; providers take nothing. Anything else is
 * refused.
 */
function fakeNash(counts: {
  orders?: number
  stores?: number
  providers?: number
  /** Serve orders as a bare array with no totalCount (tolerated, not documented). */
  bareOrders?: boolean
}) {
  const allOrders = orders(counts.orders ?? 0)
  const allStores = stores(counts.stores ?? 0)
  const allProviders = providers(counts.providers ?? 0)
  let calls = 0
  const allow = (params: Record<string, unknown>, keys: string[]) => {
    for (const k of Object.keys(params)) {
      if (!keys.includes(k)) throw new Error(`undocumented param ${k}`)
    }
  }
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error('call budget exceeded: the adapter kept paging')
    const params = cfg?.params ?? {}
    if (path === 'orders') {
      allow(params, ['limit', 'offset'])
      const limit = Number(params.limit ?? ORDERS_DEFAULT)
      const offset = Number(params.offset ?? 0)
      if (limit < 1 || limit > ORDERS_MAX) throw new Error(`limit ${limit} is outside 1..100`)
      if (counts.bareOrders) return { data: allOrders.slice(offset, offset + limit) }
      return {
        data: {
          results: allOrders.slice(offset, offset + limit),
          totalCount: allOrders.length,
          limit,
          offset,
        },
      }
    }
    if (path === 'store_locations') {
      allow(params, ['size', 'offset'])
      const size = Number(params.size ?? STORES_DEFAULT)
      const offset = Number(params.offset ?? 0)
      return { data: { storeLocations: allStores.slice(offset, offset + size) } }
    }
    if (path === 'providers') {
      allow(params, [])
      return { data: allProviders }
    }
    throw new Error(`unexpected path ${path}`)
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
  return { get }
}

const adapter = () => new NashAdapter()
const ids = (rows: Array<{ id?: string }>) => rows.map((r) => r.id)

afterEach(() => vi.restoreAllMocks())

describe('nash listOrders paging (limit + offset, totalCount)', () => {
  const list = (p: QueryParams) => adapter().listOrders(CREDS, p)

  it('with 2L+1 rows, pages 1..3 at limit L return every order once, in order, hasMore exact', async () => {
    const L = 4
    const N = 2 * L + 1
    fakeNash({ orders: N })
    const seen: Array<string | undefined> = []
    const hasMore: boolean[] = []
    const reported: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const env = listPage(await list(params), params, 'nash')
      seen.push(...ids(env.data))
      hasMore.push(env.meta.hasMore as boolean)
      reported.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)).toEqual(expect.objectContaining({ totalCount: N }))
    }
    expect(seen).toEqual(ids(orders(N)))
    expect(hasMore).toEqual([true, true, false])
    expect(reported).toEqual([true, true, false])
  })

  it('the page-2 request carries the documented limit and offset', async () => {
    const { get } = fakeNash({ orders: 20 })
    await list(withPageSink({ page: 2, limit: 7 }))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![0]).toBe('orders')
    expect(get.mock.calls[0]![1]).toEqual({ params: { limit: 7, offset: 7 } })
  })

  it('a limit above the documented maximum of 100 is clamped, and the stride follows the clamp', async () => {
    const { get } = fakeNash({ orders: 250 })
    const p1 = withPageSink({ page: 1, limit: 500 })
    const env1 = listPage(await list(p1), p1, 'nash')
    expect(ids(env1.data)).toEqual(ids(orders(250).slice(0, ORDERS_MAX)))
    expect(env1.meta.hasMore).toBe(true)
    expect(readUpstreamPage(p1)).toEqual(expect.objectContaining({ pageSize: ORDERS_MAX }))
    const p2 = withPageSink({ page: 2, limit: 500 })
    const env2 = listPage(await list(p2), p2, 'nash')
    expect(ids(env2.data)).toEqual(ids(orders(250).slice(ORDERS_MAX, 2 * ORDERS_MAX)))
    expect(get.mock.calls.map((c) => c[1])).toEqual([
      { params: { limit: ORDERS_MAX, offset: 0 } },
      { params: { limit: ORDERS_MAX, offset: ORDERS_MAX } },
    ])
  })

  it('with exactly 2L rows, the full last page reports no more from totalCount', async () => {
    const L = 3
    fakeNash({ orders: 2 * L })
    const params = withPageSink({ page: 2, limit: L })
    const env = listPage(await list(params), params, 'nash')
    expect(ids(env.data)).toEqual(ids(orders(2 * L).slice(L)))
    expect(env.meta.hasMore).toBe(false)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('a bare-array response without totalCount ends on a short page', async () => {
    fakeNash({ orders: 7, bareOrders: true })
    const p1 = withPageSink({ page: 1, limit: 4 })
    expect(ids(await list(p1))).toEqual(ids(orders(7).slice(0, 4)))
    expect(readUpstreamPage(p1)?.hasMore).toBe(true)
    expect(readUpstreamPage(p1)?.totalCount).toBeUndefined()
    const p2 = withPageSink({ page: 2, limit: 4 })
    expect(ids(await list(p2))).toEqual(ids(orders(7).slice(4)))
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('with no caller limit it sends the adapter default of 50, and a fractional limit is floored', async () => {
    const { get } = fakeNash({ orders: 120 })
    await list(withPageSink({}))
    await list(withPageSink({ page: 2, limit: 7.9 }))
    expect(get.mock.calls.map((c) => c[1])).toEqual([
      { params: { limit: 50, offset: 0 } },
      { params: { limit: 7, offset: 7 } },
    ])
  })

  it('API path: parseListQuery → adapter → listPage serves page 2 with an exact hasMore', async () => {
    fakeNash({ orders: 7 })
    const params = parseListQuery({ page: '2', limit: '3' })
    const env = listPage(await list(params), params, 'nash')
    expect(ids(env.data)).toEqual(ids(orders(7).slice(3, 6)))
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('nash listWarehouses paging (size + offset, short page ends)', () => {
  const list = (p: QueryParams) => adapter().listWarehouses(CREDS, p)

  it('with 2L+1 rows, pages 1..3 at limit L return every store location once, in order, hasMore exact', async () => {
    const L = 4
    const N = 2 * L + 1
    fakeNash({ stores: N })
    const seen: Array<string | undefined> = []
    const hasMore: boolean[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const env = listPage(await list(params), params, 'nash')
      seen.push(...ids(env.data))
      hasMore.push(env.meta.hasMore as boolean)
    }
    expect(seen).toEqual(ids(stores(N)))
    expect(hasMore).toEqual([true, true, false])
  })

  it('the page-2 request carries the documented size and offset', async () => {
    const { get } = fakeNash({ stores: 20 })
    await list(withPageSink({ page: 2, limit: 7 }))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![0]).toBe('store_locations')
    expect(get.mock.calls[0]![1]).toEqual({ params: { size: 7, offset: 7 } })
  })

  it('a full page reads as more and a short page as the end (no total is documented)', async () => {
    fakeNash({ stores: 7 })
    const p1 = withPageSink({ page: 1, limit: 4 })
    await list(p1)
    expect(readUpstreamPage(p1)).toEqual(expect.objectContaining({ hasMore: true, pageSize: 4 }))
    const p2 = withPageSink({ page: 2, limit: 4 })
    const rows = await list(p2)
    expect(ids(rows)).toEqual(ids(stores(7).slice(4)))
    expect(readUpstreamPage(p2)).toEqual(expect.objectContaining({ hasMore: false, pageSize: 4 }))
  })

  it('with no caller limit it sends size 50, and a fractional limit is floored', async () => {
    const { get } = fakeNash({ stores: 120 })
    await list(withPageSink({}))
    await list(withPageSink({ page: 2, limit: 7.9 }))
    expect(get.mock.calls.map((c) => c[1])).toEqual([
      { params: { size: 50, offset: 0 } },
      { params: { size: 7, offset: 7 } },
    ])
  })

  it('API path: parseListQuery → adapter → listPage serves page 2 with an exact hasMore', async () => {
    fakeNash({ stores: 7 })
    const params = parseListQuery({ page: '2', limit: '3' })
    const env = listPage(await list(params), params, 'nash')
    expect(ids(env.data)).toEqual(ids(stores(7).slice(3, 6)))
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('nash listCarriers paging (unpaginated upstream, paged locally)', () => {
  const list = (p: QueryParams) => adapter().listCarriers(CREDS, p)

  it('with 2L+1 rows, pages 1..3 at limit L return every provider once, in order, hasMore exact', async () => {
    const L = 2
    const N = 2 * L + 1
    const { get } = fakeNash({ providers: N })
    const seen: Array<string | undefined> = []
    const hasMore: boolean[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const env = listPage(await list(params), params, 'nash')
      seen.push(...ids(env.data))
      hasMore.push(env.meta.hasMore as boolean)
      expect(readUpstreamPage(params)).toEqual(
        expect.objectContaining({ totalCount: N, pagedLocally: true }),
      )
    }
    expect(seen).toEqual(providers(N).map((p) => p.providerId))
    expect(hasMore).toEqual([true, true, false])
    // Every page is one parameterless request for the whole list.
    expect(get.mock.calls.map((c) => c[1])).toEqual([
      { params: undefined },
      { params: undefined },
      { params: undefined },
    ])
  })

  it('API path: parseListQuery → adapter → listPage serves page 2 with an exact hasMore', async () => {
    fakeNash({ providers: 7 })
    const params = parseListQuery({ page: '2', limit: '3' })
    const env = listPage(await list(params), params, 'nash')
    expect(ids(env.data)).toEqual(['prv_4', 'prv_5', 'prv_6'])
    expect(env.meta.hasMore).toBe(true)
  })
})
