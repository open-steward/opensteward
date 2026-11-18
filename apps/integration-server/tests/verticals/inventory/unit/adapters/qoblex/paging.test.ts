/**
 * Qoblex listLocations paging: GET /v1/account/locations is unpaginated, so
 * the adapter slices the whole collection into the caller's pages.
 *
 * Qoblex's own OpenAPI spec (https://api.qoblex.com/openapi/v1/openapi.json,
 * the file its API reference at https://api.qoblex.com/ loads) declares GET
 * /v1/account/locations ("List Locations") with only three query parameters:
 * `filters`, `sort_by` and `expand`. It has no `page` parameter (unlike
 * /v1/products, /v1/suppliers, /v1/purchase_orders and /v1/adjustments), and
 * its 200 response is a bare array: "An array of locations, each with its id,
 * name, and purchase-order availability flag." There is no count envelope, so
 * one response is the whole collection, and no maximum applies to it.
 *
 * Before the fix the adapter returned every location for every page: the
 * router truncated to `limit`, page 2 repeated page 1, and locations past the
 * first page were unreachable.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  declaredPageMax,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { QoblexAdapter } from '../../../../../../src/verticals/inventory/adapters/qoblex/index'
import type { InventoryAdapter } from '../../../../../../src/verticals/inventory/adapter/interface'

const CREDS = { accessToken: 'qoblex_test' }
/**
 * No case here needs more than a handful of upstream reads. A loop that keeps
 * paging past the end fails by name instead of running the worker out of
 * memory.
 */
const CALL_BUDGET = 20
/** The only query parameters the spec declares on GET /v1/account/locations. */
const DOCUMENTED_PARAMS = new Set(['filters', 'sort_by', 'expand'])

function locations(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `Warehouse ${i + 1}`,
    available_in_purchase_orders: true,
  }))
}

function ids(start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(start + i))
}

/**
 * A fake Qoblex that honours ONLY what the spec documents for GET
 * /v1/account/locations: `filters`, `sort_by` and `expand`, none of which
 * pages. Any other parameter the adapter sends (a `page`, a size) is refused
 * rather than silently ignored, and every call answers with the whole
 * collection as a bare array.
 *
 * The spec states no default order for this endpoint (unlike
 * /v1/purchase_orders, whose `sort_by` "Defaults to `-create...`"), so without
 * a `sort_by` the fake answers in a different order on every call. Only the
 * documented `sort_by=id` ("no prefix for ascending") gives a stable order.
 */
function fakeQoblex(total: number, body?: unknown) {
  const all = locations(total)
  let calls = 0
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) {
      throw new Error(`call budget (${CALL_BUDGET}) exceeded: the adapter kept paging`)
    }
    if (path !== '/v1/account/locations') throw new Error(`unexpected path ${path}`)
    const params = cfg?.params ?? {}
    for (const key of Object.keys(params)) {
      if (!DOCUMENTED_PARAMS.has(key)) {
        throw new Error(`GET /v1/account/locations does not take \`${key}\``)
      }
    }
    if (body !== undefined) return { data: body }
    const sortBy = params.sort_by
    if (sortBy === 'id') return { data: [...all] }
    if (sortBy !== undefined) throw new Error(`the fake does not model sort_by=${String(sortBy)}`)
    // Unspecified order: rotate by a different amount on each call.
    const shift = total ? (calls * 7) % total : 0
    return { data: [...all.slice(shift), ...all.slice(0, shift)] }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return { get }
}

const adapter = () => new QoblexAdapter()
/** The adapter as the router holds it, for parseListQuery and declaredPageMax. */
const routed = (): InventoryAdapter => adapter()
const call = (params: QueryParams) => adapter().listLocations(CREDS, params)

/** Drive the method as the sync worker does: withPageSink({ page, limit }). */
async function walk(limit: number, pages: number) {
  const seen: string[] = []
  const hasMore: (boolean | undefined)[] = []
  for (let k = 1; k <= pages; k++) {
    const params = withPageSink({ page: k, limit })
    seen.push(...(await call(params)).map((l) => l.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { seen, hasMore }
}

afterEach(() => vi.restoreAllMocks())

describe('qoblex capabilities', () => {
  it('declares no maxPageSize: its paged list methods still send a fixed-size page', () => {
    expect(declaredPageMax(routed())).toBeUndefined()
  })
})

describe('qoblex listLocations paging (GET /v1/account/locations, unpaginated)', () => {
  it('N = 2L + 1: three worker pages serve every location once, hasMore [true, true, false]', async () => {
    const L = 4
    const N = 2 * L + 1
    fakeQoblex(N)
    const { seen, hasMore } = await walk(L, 3)
    expect(seen).toEqual(ids(1, N))
    expect(hasMore).toEqual([true, true, false])
  })

  it('page 2 is page 2: rows L+1..2L, not a repeat of page 1', async () => {
    fakeQoblex(9)
    const params = withPageSink({ page: 2, limit: 4 })
    expect((await call(params)).map((l) => l.id)).toEqual(ids(5, 4))
  })

  it('every page sends the same request, pinned to id order, with no paging parameter', async () => {
    // The spec documents no paging key here, so none is sent. Each caller page
    // is a separate fetch of the whole list and no default order is stated, so
    // every fetch asks for the documented `sort_by=id` and nothing else.
    const { get } = fakeQoblex(9)
    await walk(4, 3)
    expect(get).toHaveBeenCalledTimes(3)
    for (const c of get.mock.calls) {
      expect(c[0]).toBe('/v1/account/locations')
      expect(c[1]?.params).toEqual({ sort_by: 'id' })
    }
  })

  it('pages cut one stable sequence even though the unsorted order changes between fetches', async () => {
    // Pages 1 and 2 come from two separate fetches. Without a pinned order the
    // second fetch may shuffle, and page 2 would repeat or skip page 1's rows.
    fakeQoblex(9)
    const p1 = await call(withPageSink({ page: 1, limit: 4 }))
    const p2 = await call(withPageSink({ page: 2, limit: 4 }))
    expect(p1.map((l) => l.id)).toEqual(ids(1, 4))
    expect(p2.map((l) => l.id)).toEqual(ids(5, 4))
  })

  it('reports the whole collection as totalCount and marks the page as paged locally', async () => {
    fakeQoblex(9)
    const params = withPageSink({ page: 1, limit: 4 })
    await call(params)
    expect(readUpstreamPage(params)).toEqual({ totalCount: 9, hasMore: true, pagedLocally: true })
  })

  it('N = 2L: page 2 ends the collection and page 3 is empty', async () => {
    const L = 4
    fakeQoblex(2 * L)
    const { seen, hasMore } = await walk(L, 3)
    expect(seen).toEqual(ids(1, 2 * L))
    expect(hasMore).toEqual([true, false, false])
  })

  it('walks every location at the worker limit of 500 (no declared max)', async () => {
    // With no maxPageSize the worker pages at its own ceiling of 500.
    fakeQoblex(1200)
    const { seen, hasMore } = await walk(500, 3)
    expect(seen).toEqual(ids(1, 1200))
    expect(hasMore).toEqual([true, true, false])
  })

  it('a limit above the router cap (500) is clamped, and every location is still served once', async () => {
    // The endpoint documents no maximum, so the only clamp is parseListQuery's.
    fakeQoblex(1001)
    const seen: string[] = []
    const hasMore: (boolean | null)[] = []
    for (let k = 1; k <= 3; k++) {
      const params = parseListQuery({ page: String(k), limit: '100000' }, routed())
      expect(params.limit).toBe(500)
      const env = listPage(await call(params), params, 'qoblex')
      expect(env.meta.limit).toBe(500)
      seen.push(...env.data.map((l) => l.id))
      hasMore.push(env.meta.hasMore)
    }
    expect(seen).toEqual(ids(1, 1001))
    expect(hasMore).toEqual([true, true, false])
  })

  it('walks with the limit exactly as parseListQuery delivers it', async () => {
    fakeQoblex(15)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let k = 1; k <= 3; k++) {
      const params = parseListQuery({ page: String(k), limit: '7' }, routed())
      expect(params.limit).toBe(7)
      seen.push(...(await call(params)).map((l) => l.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(1, 15))
    expect(hasMore).toEqual([true, true, false])
  })

  it('a first request with no ?page (page undefined from parseListQuery) is page 1', async () => {
    fakeQoblex(9)
    const params = parseListQuery({ limit: '4' }, routed())
    expect(params.page).toBeUndefined()
    expect((await call(params)).map((l) => l.id)).toEqual(ids(1, 4))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('API path: parseListQuery + listPage publishes an exact meta.hasMore and totalCount', async () => {
    fakeQoblex(9)
    const p1 = parseListQuery({ page: '1', limit: '4' }, routed())
    const env1 = listPage(await call(p1), p1, 'qoblex')
    expect(env1.data.map((l) => l.id)).toEqual(ids(1, 4))
    expect(env1.meta).toEqual(
      expect.objectContaining({ page: 1, limit: 4, totalCount: 9, hasMore: true }),
    )

    const p3 = parseListQuery({ page: '3', limit: '4' }, routed())
    const env3 = listPage(await call(p3), p3, 'qoblex')
    expect(env3.data.map((l) => l.id)).toEqual(ids(9, 1))
    expect(env3.meta).toEqual(
      expect.objectContaining({ page: 3, limit: 4, totalCount: 9, hasMore: false }),
    )
  })

  it('API path: an exact multiple of the limit ends with hasMore false, not null', async () => {
    fakeQoblex(8)
    const p2 = parseListQuery({ page: '2', limit: '4' }, routed())
    const env2 = listPage(await call(p2), p2, 'qoblex')
    expect(env2.data.map((l) => l.id)).toEqual(ids(5, 4))
    expect(env2.meta.hasMore).toBe(false)
  })

  it('a direct call with no limit gets every location (nothing to page by)', async () => {
    fakeQoblex(9)
    expect((await call({})).map((l) => l.id)).toEqual(ids(1, 9))
  })

  it('getLocation finds the last location of a collection larger than any routed limit', async () => {
    // getLocation scans listLocations(credentials, {}): with no limit the local
    // slice returns every row. 1001 rows is past the router's cap of 500 and
    // past two full pages of it, so a lookup that passed any page or limit the
    // router could deliver (500, or 1000) would miss the last row.
    const { get } = fakeQoblex(1001)
    const found = await adapter().getLocation(CREDS, '1001')
    expect(found.id).toBe('1001')
    expect(found.name).toBe('Warehouse 1001')
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('a body that is not an array is an empty collection, not a crash', async () => {
    fakeQoblex(0, {})
    const params = withPageSink({ page: 1, limit: 4 })
    expect(await call(params)).toEqual([])
    expect(readUpstreamPage(params)).toEqual(
      expect.objectContaining({ totalCount: 0, hasMore: false }),
    )
  })
})
