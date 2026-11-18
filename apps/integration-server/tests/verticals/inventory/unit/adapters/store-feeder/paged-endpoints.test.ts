/**
 * StoreFeeder's paged endpoints, and the page maximum the adapter declares.
 *
 * StoreFeeder's first-party API help (ASP.NET Web API help pages):
 *
 *   GET products         https://rest.storefeeder.com/Help/Api/GET-products
 *   GET purchase-orders  https://rest.storefeeder.com/Help/Api/GET-purchase-orders
 *     PageSize: "This is an optional parameter. This will default to 100. The
 *     max page size is 100", "Range: inclusive between 1 and 100".
 *     Page: "It will default to page 1", pattern ^[1-9]\d*$.
 *     Body: { TotalItems, PagingInfo { MaxPageSize, PageSize, Page },
 *     TotalPages, Data }.
 *   GET products also takes IncludeStockLocations: "Set it if you wish to
 *   return Stock Location Information for a product".
 *
 * Before the fix the adapter declared no maximum, so the sync worker asked
 * every list method for 500 rows and listProducts, listPurchaseOrders and
 * listStockLevels sent PageSize=500, outside the documented range. And
 * listStockLevels sent the caller's limit as the number of PRODUCTS, then
 * flattened each product into its stock levels (none, one, or one per stock
 * location): a page of 4 products holding 8 stock levels was truncated to 4
 * and the other 4 were never served, and a page of products holding fewer
 * stock levels than the limit read as the end of the collection.
 *
 * The fake below honours ONLY what those pages document: PageSize outside
 * 1..100 or a Page that is not a positive integer is a 400, as is any query
 * parameter the adapter has no documented reason to send. Each bearer token
 * sees its own catalog, and POST /Token mints `tok-<username>`, so two
 * connections can be told apart.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  MAX_PAGE_LIMIT,
  _resetRowPager,
  declaredPageMax,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { StoreFeederAdapter } from '../../../../../../src/verticals/inventory/adapters/store-feeder/index'

type Row = Record<string, unknown>

const DOCUMENTED_MAX = 100
const TOKEN = 'sf_bearer_test'
/** A live bearer token, so the client never calls POST /Token. */
const CREDS: Credentials = { accessToken: TOKEN }

/** No case needs more than a handful of upstream reads; a runaway walk fails by name. */
const CALL_BUDGET = 40

/** The query parameters each path documents that the adapter has a reason to send. */
const DOCUMENTED_PARAMS: Record<string, ReadonlySet<string>> = {
  '/products': new Set(['PageSize', 'Page', 'IncludeStockLocations']),
  '/purchase-orders': new Set(['PageSize', 'Page']),
}

interface Seen {
  path: string
  params: Record<string, unknown>
  token: string
}

function badRequest(message: string): Error {
  return Object.assign(new Error(message), { response: { status: 400 } })
}

/**
 * A fake StoreFeeder at the axios seam: catalogs[token][path] is that
 * connection's collection. `totals: false` leaves TotalItems and TotalPages out
 * of the wrapper, to exercise the adapter's fallback when a body lacks them.
 */
function fakeStoreFeeder(
  catalogs: Record<string, Record<string, Row[]>>,
  { totals = true }: { totals?: boolean } = {},
) {
  const seen: Seen[] = []
  const get = vi.fn(
    async (
      path: string,
      config?: { params?: Record<string, unknown>; headers?: Record<string, string> },
    ) => {
      if (seen.length >= CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
      const token = String(config?.headers?.['Authorization'] ?? '').replace(/^Bearer /, '')
      const params = { ...(config?.params ?? {}) }
      seen.push({ path, params, token })
      const rows = catalogs[token]?.[path]
      if (!rows)
        throw Object.assign(new Error(`unexpected GET ${path} as ${token}`), {
          response: { status: 404 },
        })
      for (const k of Object.keys(params)) {
        if (!DOCUMENTED_PARAMS[path]!.has(k))
          throw badRequest(`GET ${path}: undocumented parameter ${k}`)
      }
      const size = params['PageSize'] === undefined ? DOCUMENTED_MAX : Number(params['PageSize'])
      if (!Number.isInteger(size) || size < 1 || size > DOCUMENTED_MAX) {
        throw badRequest(`GET ${path}: PageSize ${String(params['PageSize'])} is outside 1..100`)
      }
      const rawPage = params['Page'] === undefined ? '1' : String(params['Page'])
      if (!/^[1-9]\d*$/.test(rawPage))
        throw badRequest(`GET ${path}: Page ${rawPage} is not ^[1-9]\\d*$`)
      const page = Number(rawPage)
      return {
        data: {
          ...(totals ? { TotalItems: rows.length, TotalPages: Math.ceil(rows.length / size) } : {}),
          PagingInfo: { MaxPageSize: DOCUMENTED_MAX, PageSize: size, Page: page },
          Data: rows.slice((page - 1) * size, page * size),
        },
      }
    },
  )
  const post = vi.fn(async (path: string, body?: unknown) => {
    if (path !== '/Token') throw new Error(`unexpected POST ${path}`)
    const form = new URLSearchParams(String(body))
    if (form.get('grant_type') !== 'password') throw badRequest('grant_type must be password')
    return {
      data: {
        access_token: `tok-${form.get('username')}/${form.get('client_id')}`,
        token_type: 'bearer',
        expires_in: 3600,
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post } as unknown as ReturnType<
    typeof axios.create
  >)
  return { seen }
}

const adapter = () => new StoreFeederAdapter()
type ListMethod = 'listProducts' | 'listPurchaseOrders' | 'listStockLevels'
/** A list method, typed as the rows the router and the sync worker read. */
const list = (
  method: ListMethod,
  params: QueryParams,
  creds: Credentials = CREDS,
): Promise<Array<{ id: string }>> => adapter()[method](creds, params)

/**
 * Drive a method as the sync worker does: withPageSink({ page, limit }) from
 * page 1, stopping on a reported `hasMore: false`, or on a short page when
 * nothing was reported.
 */
async function syncWalk(method: ListMethod, limit: number, creds: Credentials = CREDS) {
  const served: string[] = []
  const hasMore: Array<boolean | undefined> = []
  for (let page = 1; page <= 400; page++) {
    const params = withPageSink({ page, limit })
    const rows = await list(method, params, creds)
    served.push(...rows.map((r) => r.id))
    const more = readUpstreamPage(params)?.hasMore
    hasMore.push(more)
    if (more === false || (more === undefined && rows.length < limit)) return { served, hasMore }
  }
  throw new Error(`${method} never ended`)
}

/** The sync worker's page size: min(500, declared max). */
const workerLimit = () => Math.min(MAX_PAGE_LIMIT, declaredPageMax(adapter()) ?? MAX_PAGE_LIMIT)

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

describe('store-feeder page maximum', () => {
  it('declares the documented 100, so the sync worker and the router ask for at most 100', () => {
    expect(declaredPageMax(adapter())).toBe(DOCUMENTED_MAX)
    expect(workerLimit()).toBe(DOCUMENTED_MAX)
    expect(parseListQuery({ limit: '500' }, adapter()).limit).toBe(DOCUMENTED_MAX)
  })
})

const PAGED = [
  {
    method: 'listProducts' as const,
    path: '/products',
    row: (n: number): Row => ({ ProductID: n, SKU: `SKU-${n}` }),
  },
  {
    method: 'listPurchaseOrders' as const,
    path: '/purchase-orders',
    row: (n: number): Row => ({ PurchaseOrderID: n, PurchaseOrderReference: `PO-${n}` }),
  },
]

describe.each(PAGED)('store-feeder $method (GET $path, PageSize + Page)', (c) => {
  const ids = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => String(from + i))
  const catalog = (n: number) => ({
    [TOKEN]: { [c.path]: Array.from({ length: n }, (_, i) => c.row(i + 1)) },
  })

  it('the sync worker walks every row at PageSize 100, inside the documented range', async () => {
    const { seen } = fakeStoreFeeder(catalog(250))
    const { served } = await syncWalk(c.method, workerLimit())
    expect(served).toEqual(ids(1, 250))
    expect(seen.map((s) => s.params)).toEqual([
      { PageSize: 100, Page: 1 },
      { PageSize: 100, Page: 2 },
      { PageSize: 100, Page: 3 },
    ])
  })

  it('the API path clamps limit=500 to 100 and sends PageSize 100', async () => {
    const { seen } = fakeStoreFeeder(catalog(250))
    const params = parseListQuery({ page: '2', limit: '500' }, adapter())
    const env = listPage(await list(c.method, params), params, 'store-feeder')
    expect(env.data.map((r) => r.id)).toEqual(ids(101, 200))
    expect(env.meta.limit).toBe(DOCUMENTED_MAX)
    expect(seen.map((s) => s.params)).toEqual([{ PageSize: 100, Page: 2 }])
  })
})

// ── listStockLevels: rows flattened out of pages of products ────────────────

/** How many stock levels a product carries, and in which shape. */
type Carries = number | 'total' | 'none'

/**
 * A product carrying `k` per-stock-location levels (ids `<n>:<n*10+j>`), one
 * product-total level from InventoryInformation (id `<n>:`), or none.
 */
function product(n: number, carries: Carries): Row {
  if (carries === 'none') return { ProductID: n, SKU: `SKU-${n}` }
  if (carries === 'total')
    return { ProductID: n, SKU: `SKU-${n}`, InventoryInformation: { Inventory: 5 } }
  return {
    ProductID: n,
    SKU: `SKU-${n}`,
    WarehouseInformation: [
      {
        Warehouse: { WarehouseID: 7, WarehouseName: 'Main' },
        StockLocations: Array.from({ length: carries }, (_, j) => ({
          StockLocation: {
            StockLocationID: n * 10 + j + 1,
            StockLocationReference: `A-${n}-${j + 1}`,
          },
          PhysicalStock: 3,
          Available: 2,
          Allocated: 1,
        })),
      },
    ],
  }
}

/** Products 1..specs.length, and the stock-level ids they carry, in order. */
function stock(specs: Carries[]) {
  const products = specs.map((carries, i) => product(i + 1, carries))
  const levels = specs.flatMap((carries, i) => {
    const n = i + 1
    if (carries === 'none') return []
    if (carries === 'total') return [`${n}:`]
    return Array.from({ length: carries }, (_, j) => `${n}:${n * 10 + j + 1}`)
  })
  return { products, levels }
}

/** A mixed catalog: per four products, none, 1 location, 3 locations, a product total. */
const MIXED: Carries[] = Array.from(
  { length: 250 },
  (_, i) => (['none', 1, 3, 'total'] as const)[i % 4]!,
)

describe('store-feeder listStockLevels (rows flattened out of GET /products pages)', () => {
  it('6 products x 2 stock locations at limit 4: the API path serves all 12, not 8', async () => {
    const { products, levels } = stock(Array.from({ length: 6 }, () => 2))
    expect(levels).toHaveLength(12)
    fakeStoreFeeder({ [TOKEN]: { '/products': products } })
    const served: string[] = []
    const hasMore: Array<boolean | null> = []
    for (let page = 1; page <= 3; page++) {
      const params = parseListQuery({ page: String(page), limit: '4' }, adapter())
      const env = listPage(await adapter().listStockLevels(CREDS, params), params, 'store-feeder')
      served.push(...env.data.map((r) => r.id))
      hasMore.push(env.meta.hasMore)
    }
    expect(served).toEqual(levels)
    expect(hasMore).toEqual([true, true, false])
  })

  it('a page of products carrying almost no stock levels is not taken as the end', async () => {
    // Products 1..100 carry one level between them; 101..300 carry one each.
    const specs: Carries[] = Array.from({ length: 300 }, (_, i) =>
      i < 100 ? (i === 49 ? 1 : 'none') : 1,
    )
    const { products, levels } = stock(specs)
    expect(levels).toHaveLength(201)
    fakeStoreFeeder({ [TOKEN]: { '/products': products } })
    const { served, hasMore } = await syncWalk('listStockLevels', workerLimit())
    expect(served).toEqual(levels)
    expect(hasMore).toEqual([true, true, false])
  })

  it.each([3, 7, 100])(
    'the sync worker at limit %i serves every stock level of a mixed catalog once, in order',
    async (limit) => {
      const { products, levels } = stock(MIXED)
      fakeStoreFeeder({ [TOKEN]: { '/products': products } })
      const { served, hasMore } = await syncWalk('listStockLevels', limit)
      expect(served).toEqual(levels)
      expect(hasMore.at(-1)).toBe(false)
      expect(hasMore.slice(0, -1).every((m) => m === true)).toBe(true)
    },
  )

  it('asks GET /products for the documented 100 per page with IncludeStockLocations, once per upstream page', async () => {
    const { products } = stock(MIXED)
    const { seen } = fakeStoreFeeder({ [TOKEN]: { '/products': products } })
    await syncWalk('listStockLevels', 7)
    expect(seen.map((s) => s.path)).toEqual(['/products', '/products', '/products'])
    expect(seen.map((s) => s.params)).toEqual([
      { PageSize: 100, IncludeStockLocations: true, Page: 1 },
      { PageSize: 100, IncludeStockLocations: true, Page: 2 },
      { PageSize: 100, IncludeStockLocations: true, Page: 3 },
    ])
  })

  it('an exact multiple of the limit ends with meta.hasMore false, not null', async () => {
    const { products, levels } = stock(Array.from({ length: 200 }, () => 1))
    const { seen } = fakeStoreFeeder({ [TOKEN]: { '/products': products } })
    const params = parseListQuery({ page: '2', limit: '100' }, adapter())
    const env = listPage(await adapter().listStockLevels(CREDS, params), params, 'store-feeder')
    expect(env.data.map((r) => r.id)).toEqual(levels.slice(100, 200))
    expect(env.meta.hasMore).toBe(false)
    // TotalPages 2 ends the walk: no request for a page 3 that cannot exist.
    expect(seen.map((s) => s.params['Page'])).toEqual([1, 2])
  })

  it('a wrapper without TotalPages goes on after a full page and stops at an empty one', async () => {
    const { products, levels } = stock(Array.from({ length: 200 }, () => 1))
    const { seen } = fakeStoreFeeder({ [TOKEN]: { '/products': products } }, { totals: false })
    const { served, hasMore } = await syncWalk('listStockLevels', workerLimit())
    expect(served).toEqual(levels)
    expect(hasMore).toEqual([true, false])
    expect(seen.map((s) => s.params['Page'])).toEqual([1, 2, 3])
  })

  it('a jump straight to page 3 serves rows 21..30 of the flattened stream', async () => {
    const { products, levels } = stock(MIXED)
    fakeStoreFeeder({ [TOKEN]: { '/products': products } })
    const params = withPageSink({ page: 3, limit: 10 })
    expect((await adapter().listStockLevels(CREDS, params)).map((r) => r.id)).toEqual(
      levels.slice(20, 30),
    )
    expect(readUpstreamPage(params)).toEqual({ hasMore: true, pagedLocally: true })
  })

  it('an empty catalog is one empty last page', async () => {
    fakeStoreFeeder({ [TOKEN]: { '/products': [] } })
    const params = withPageSink({ page: 1, limit: 100 })
    expect(await adapter().listStockLevels(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)).toEqual({ hasMore: false, pagedLocally: true })
  })

  // The row pager keeps ROWS per key, so a key shared by two connections
  // would serve one connection's rows to the other without a request.
  const login = (username: string, apiKey: string): Credentials => ({
    accessToken: '',
    extra: { username, password: 'pw', apiKey },
  })
  it.each([
    [
      'logins differing only by username (one API key)',
      login('a@example.com', 'shared-key'),
      'tok-a@example.com/shared-key',
      login('b@example.com', 'shared-key'),
      'tok-b@example.com/shared-key',
    ],
    [
      'logins differing only by API key (one username)',
      login('ops@example.com', 'key-1'),
      'tok-ops@example.com/key-1',
      login('ops@example.com', 'key-2'),
      'tok-ops@example.com/key-2',
    ],
    [
      'bearer tokens with no stored login',
      { accessToken: 'bearer-a' },
      'bearer-a',
      { accessToken: 'bearer-b' },
      'bearer-b',
    ],
  ])('two connections never share a walk: %s', async (_, credsA, tokenA, credsB, tokenB) => {
    const a = stock(Array.from({ length: 10 }, () => 1))
    const b = a.products.map((p) => ({ ...p, ProductID: Number(p['ProductID']) + 100 }))
    const { seen } = fakeStoreFeeder({
      [tokenA]: { '/products': a.products },
      [tokenB]: { '/products': b },
    })
    const pageA = await adapter().listStockLevels(credsA, withPageSink({ page: 1, limit: 4 }))
    expect(pageA.map((r) => r.productId)).toEqual(['1', '2', '3', '4'])
    // Page 2 of the OTHER connection: a shared walk would serve A's rows 5..8
    // from memory without asking the platform as B.
    const pageB = await adapter().listStockLevels(credsB, withPageSink({ page: 2, limit: 4 }))
    expect(pageB.map((r) => r.productId)).toEqual(['105', '106', '107', '108'])
    expect(seen.map((s) => s.token)).toEqual([tokenA, tokenB])
  })
})
