/**
 * StoreFeeder warehouses and suppliers are unpaginated. The adapter fetches
 * each whole collection and slices it into the caller's pages.
 *
 * StoreFeeder's first-party API help (ASP.NET Web API help pages):
 *
 *   GET warehouses  https://rest.storefeeder.com/Help/Api/GET-warehouses
 *     "Returns a list of Warehouses". URI Parameters: "None."
 *     Resource description: "Collection of WarehouseModel".
 *
 *   GET suppliers   https://rest.storefeeder.com/Help/Api/GET-suppliers
 *     "Get all suppliers." URI Parameters: "None."
 *     Resource description: "Collection of SupplierGetModel", and the JSON
 *     sample is a top-level array.
 *
 * The paged endpoints on the same site (GET products, GET purchase-orders,
 * GET stocklocations) document PageSize and Page; these two document neither.
 *
 * Before the fix each method returned the whole collection for every caller
 * page: the router truncated it to `limit`, page 2 repeated page 1, and rows
 * past the first page were unreachable.
 *
 * The fake below honours ONLY what those pages document. It refuses any query
 * parameter (a PageSize or Page would be one) and answers every request with
 * the whole collection as a top-level array.
 *
 * The adapter declares the 100-row maximum its paged endpoints document
 * (paged-endpoints.test.ts), so the router and the sync worker ask these two
 * for at most 100 rows a page too; they slice locally at whatever is asked.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  MAX_PAGE_LIMIT,
  declaredPageMax,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { StoreFeederAdapter } from '../../../../../../src/verticals/inventory/adapters/store-feeder/index'

/** StoreFeeder's documented PageSize maximum, which the adapter declares. */
const DOCUMENTED_MAX = 100

/** A live bearer token, so the client never calls POST /Token. */
const CREDS = { accessToken: 'sf_bearer_test' }

/**
 * No case needs more than a handful of upstream reads. A loop that keeps
 * paging past the end fails by name instead of hanging the worker.
 */
const CALL_BUDGET = 20

type Method = 'listLocations' | 'listSuppliers'

interface Case {
  method: Method
  path: string
  row: (n: number) => Record<string, unknown>
}

const CASES: Case[] = [
  {
    method: 'listLocations',
    path: '/warehouses',
    row: (n) => ({
      WarehouseID: n,
      WarehouseGuid: `wh-guid-${n}`,
      WarehouseName: `Warehouse ${n}`,
    }),
  },
  {
    method: 'listSuppliers',
    path: '/suppliers',
    row: (n) => ({ SupplierID: n, SupplierGUID: `sup-guid-${n}`, Name: `Supplier ${n}` }),
  },
]

/** The ids the transforms produce for rows start..start+count-1 (String(WarehouseID|SupplierID)). */
function ids(start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(start + i))
}

interface Seen {
  path: string
  params: Record<string, unknown> | undefined
}

/**
 * A fake StoreFeeder at the axios seam the client uses. Every GET to the list
 * endpoint answers with the whole collection, whatever page the caller is on,
 * because the platform documents no paging parameter for it.
 */
function fakeStoreFeeder(c: Case, total: number, body?: unknown) {
  const all = Array.from({ length: total }, (_, i) => c.row(i + 1))
  const seen: Seen[] = []
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    if (seen.length >= CALL_BUDGET) {
      throw new Error(`call budget (${CALL_BUDGET}) exceeded: the adapter kept paging`)
    }
    seen.push({ path, params: config?.params })
    if (path !== c.path) {
      throw Object.assign(new Error(`unexpected GET ${path}`), { response: { status: 404 } })
    }
    const sent = Object.keys(config?.params ?? {})
    if (sent.length > 0) {
      throw Object.assign(
        new Error(`GET ${path} documents no URI parameters (got ${sent.join(', ')})`),
        {
          response: { status: 400 },
        },
      )
    }
    return { data: body === undefined ? all : body }
  })
  const post = vi.fn(async () => {
    throw new Error('no POST is expected: the credentials carry a live bearer token')
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post } as unknown as ReturnType<
    typeof axios.create
  >)
  return { seen }
}

const adapter = () => new StoreFeederAdapter()
/** The method under test, typed as the rows the router and the sync worker read. */
const list = (c: Case, params: QueryParams): Promise<Array<{ id: string }>> =>
  adapter()[c.method](CREDS, params)
const call = async (c: Case, params: QueryParams): Promise<string[]> =>
  (await list(c, params)).map((r) => r.id)

/** Drive a method as the sync worker does: withPageSink({ page, limit }) for pages 1..n. */
async function walk(c: Case, limit: number, pages = 3) {
  const served: string[] = []
  const hasMore: Array<boolean | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    served.push(...(await call(c, params)))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { served, hasMore }
}

afterEach(() => vi.restoreAllMocks())

describe.each(CASES)('store-feeder $method paging (GET $path, unpaginated)', (c) => {
  it('N = 2L + 1: three worker pages serve every row once, hasMore [true, true, false]', async () => {
    const L = 4
    const N = 2 * L + 1
    fakeStoreFeeder(c, N)
    const { served, hasMore } = await walk(c, L)
    expect(served).toEqual(ids(1, N))
    expect(hasMore).toEqual([true, true, false])
  })

  it('page 2 is rows L+1..2L, not a repeat of page 1', async () => {
    fakeStoreFeeder(c, 9)
    expect(await call(c, withPageSink({ page: 2, limit: 4 }))).toEqual(ids(5, 4))
  })

  it(`every page sends the same bare GET ${c.path}: the platform documents no URI parameters`, async () => {
    const { seen } = fakeStoreFeeder(c, 9)
    await walk(c, 4)
    expect(seen).toHaveLength(3)
    for (const s of seen) {
      expect(s.path).toBe(c.path)
      expect(s.params ?? {}).toEqual({})
    }
  })

  it('reports the whole collection as totalCount and marks the page as paged locally', async () => {
    fakeStoreFeeder(c, 9)
    const params = withPageSink({ page: 1, limit: 4 })
    await call(c, params)
    expect(readUpstreamPage(params)).toEqual({ totalCount: 9, hasMore: true, pagedLocally: true })
  })

  it('N = 2L: page 2 ends the collection and page 3 is empty', async () => {
    const L = 4
    fakeStoreFeeder(c, 2 * L)
    const { served, hasMore } = await walk(c, L)
    expect(served).toEqual(ids(1, 2 * L))
    expect(hasMore).toEqual([true, false, false])
  })

  it('an empty collection is one empty last page', async () => {
    fakeStoreFeeder(c, 0)
    const params = withPageSink({ page: 1, limit: 4 })
    expect(await call(c, params)).toEqual([])
    expect(readUpstreamPage(params)).toEqual({ totalCount: 0, hasMore: false, pagedLocally: true })
  })

  it("walks every row at the sync worker's limit, min(500, declared max) = 100", async () => {
    const workerLimit = Math.min(MAX_PAGE_LIMIT, declaredPageMax(adapter()) ?? MAX_PAGE_LIMIT)
    expect(workerLimit).toBe(DOCUMENTED_MAX)
    fakeStoreFeeder(c, 250)
    const { served, hasMore } = await walk(c, workerLimit)
    expect(served).toEqual(ids(1, 250))
    expect(hasMore).toEqual([true, true, false])
  })

  it('a limit above the declared max is clamped to 100, and every row is still served once', async () => {
    // These endpoints document no page size; the clamp is the adapter-wide declared max.
    fakeStoreFeeder(c, 201)
    const served: string[] = []
    const hasMore: Array<boolean | null> = []
    for (let page = 1; page <= 3; page++) {
      const params = parseListQuery({ page: String(page), limit: '100000' }, adapter())
      expect(params.limit).toBe(DOCUMENTED_MAX)
      const env = listPage(await list(c, params), params, 'store-feeder')
      expect(env.meta.limit).toBe(DOCUMENTED_MAX)
      served.push(...env.data.map((r) => r.id))
      hasMore.push(env.meta.hasMore)
    }
    expect(served).toEqual(ids(1, 201))
    expect(hasMore).toEqual([true, true, false])
  })

  it('walks with the limit exactly as parseListQuery delivers it', async () => {
    fakeStoreFeeder(c, 15)
    const served: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = parseListQuery({ page: String(page), limit: '7' }, adapter())
      expect(params.limit).toBe(7)
      served.push(...(await call(c, params)))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(ids(1, 15))
    expect(hasMore).toEqual([true, true, false])
  })

  it('API path: parseListQuery + listPage publishes an exact meta.hasMore and totalCount', async () => {
    fakeStoreFeeder(c, 9)
    const p1 = parseListQuery({ page: '1', limit: '4' }, adapter())
    const env1 = listPage(await list(c, p1), p1, 'store-feeder')
    expect(env1.data.map((r) => r.id)).toEqual(ids(1, 4))
    expect(env1.meta).toEqual(
      expect.objectContaining({ page: 1, limit: 4, totalCount: 9, hasMore: true }),
    )

    const p3 = parseListQuery({ page: '3', limit: '4' }, adapter())
    const env3 = listPage(await list(c, p3), p3, 'store-feeder')
    expect(env3.data.map((r) => r.id)).toEqual(ids(9, 1))
    expect(env3.meta).toEqual(
      expect.objectContaining({ page: 3, limit: 4, totalCount: 9, hasMore: false }),
    )
  })

  it('API path: an exact multiple of the limit ends with hasMore false, not null', async () => {
    fakeStoreFeeder(c, 8)
    const p2 = parseListQuery({ page: '2', limit: '4' }, adapter())
    const env2 = listPage(await list(c, p2), p2, 'store-feeder')
    expect(env2.data.map((r) => r.id)).toEqual(ids(5, 4))
    expect(env2.meta.hasMore).toBe(false)
  })

  it('API path: a request with no page is page 1', async () => {
    fakeStoreFeeder(c, 9)
    const params = parseListQuery({ limit: '4' }, adapter())
    const env = listPage(await list(c, params), params, 'store-feeder')
    expect(env.data.map((r) => r.id)).toEqual(ids(1, 4))
    expect(env.meta.hasMore).toBe(true)
  })

  // The page reports its rows as the WHOLE collection, and a cache marks the
  // collection complete on that. An unrecognised body read as zero rows would
  // tell the sync that every warehouse or supplier it holds is gone, and one
  // page of a paged wrapper read as everything would drop the rest.
  const two = [c.row(1), c.row(2)]
  const fullPage = Array.from({ length: 100 }, (_, i) => c.row(i + 1))
  it.each([
    // GET-warehouses' hand-set JSON sample is { "Warehouse": { ... } }.
    ['the help-page sample { Warehouse: {...} }', { Warehouse: { WarehouseID: 1 } }, 'Warehouse'],
    ['a keyed array { Warehouses: [...] }', { Warehouses: [{ WarehouseID: 1 }] }, 'Warehouses'],
    ['a keyed array { Suppliers: [...] }', { Suppliers: [{ SupplierID: 1 }] }, 'Suppliers'],
    ['a keyed null { Warehouses: null }', { Warehouses: null }, 'holding Warehouses'],
    ['an ASP.NET error body { Message }', { Message: 'An error has occurred.' }, 'error body'],
    ['a string', '<html>Sign in</html>', 'got string'],
    ['null', null, 'got null'],
    ['a non-array Data', { Data: { WarehouseID: 1 }, TotalItems: 1 }, 'non-array Data'],
    [
      'one page, TotalItems and TotalPages both past it',
      { Data: two, TotalItems: 5, TotalPages: 3 },
      'TotalItems 5',
    ],
    ['one page, only TotalItems past it', { Data: two, TotalItems: 5 }, 'TotalItems 5'],
    ['one page, only TotalPages past it', { Data: two, TotalPages: 3 }, 'TotalPages 3'],
    ['no Data, TotalItems 5', { TotalItems: 5 }, '0 rows of TotalItems 5'],
    ['Data null, TotalItems 5', { Data: null, TotalItems: 5 }, '0 rows of TotalItems 5'],
    ['no Data, TotalPages 3', { TotalPages: 3 }, 'TotalPages 3'],
    ['rows with neither total', { Data: two }, 'neither TotalItems nor TotalPages'],
    [
      'a full 100-row page with PagingInfo and no totals',
      { Data: fullPage, PagingInfo: { MaxPageSize: 100, PageSize: 100, Page: 1 } },
      '100 rows in Data with neither',
    ],
  ])(
    'a body that does not prove it holds every row (%s) is refused, not read as the collection',
    async (_, body, why) => {
      fakeStoreFeeder(c, 0, body)
      const params = withPageSink({ page: 1, limit: 4 })
      const err = await list(c, params).then(
        () => undefined,
        (e: unknown) => e,
      )
      expect(err).toBeInstanceOf(Error)
      expect((err as Error).message).toMatch(
        new RegExp(`^store-feeder GET ${c.path} did not return the whole collection`),
      )
      expect((err as Error).message).toContain(why)
      expect(readUpstreamPage(params)).toBeUndefined()
    },
  )

  it.each([
    ['{ TotalItems: 0 }', { TotalItems: 0 }],
    ['{ Data: null }', { Data: null }],
    [
      'the documented wrapper, empty',
      {
        TotalItems: 0,
        PagingInfo: { MaxPageSize: 100, PageSize: 100, Page: 1 },
        TotalPages: 0,
        Data: [],
      },
    ],
  ])(
    'a body with no row in it and no total above zero (%s) is an empty collection',
    async (_, body) => {
      fakeStoreFeeder(c, 0, body)
      const params = withPageSink({ page: 1, limit: 4 })
      expect(await call(c, params)).toEqual([])
      expect(readUpstreamPage(params)).toEqual({
        totalCount: 0,
        hasMore: false,
        pagedLocally: true,
      })
    },
  )

  const five = Array.from({ length: 5 }, (_, i) => c.row(i + 1))
  it.each([
    ['TotalItems equal to its rows', { Data: five, TotalItems: 5 }],
    ['TotalPages 1', { Data: five, TotalPages: 1 }],
    // A null total is a total the body does not carry, not a record it holds.
    ['TotalPages 1 beside a null TotalItems', { Data: five, TotalItems: null, TotalPages: 1 }],
    ['TotalItems 5 beside a null TotalPages', { Data: five, TotalItems: 5, TotalPages: null }],
    [
      'the documented wrapper, one page of everything',
      {
        TotalItems: 5,
        PagingInfo: { MaxPageSize: 100, PageSize: 100, Page: 1 },
        TotalPages: 1,
        Data: five,
      },
    ],
  ])('a Data wrapper that proves it holds every row (%s) is sliced by page', async (_, body) => {
    fakeStoreFeeder(c, 0, body)
    const params = withPageSink({ page: 2, limit: 2 })
    expect(await call(c, params)).toEqual(ids(3, 2))
    expect(readUpstreamPage(params)).toEqual({ totalCount: 5, hasMore: true, pagedLocally: true })
  })
})
