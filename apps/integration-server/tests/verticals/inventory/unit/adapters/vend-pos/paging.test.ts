/**
 * Vend POS (Lightspeed Retail X-Series) list paging: API 2.0 pages by a
 * `version` keyset, walked through the shared cursor pager.
 *
 * Lightspeed's API 2.0 pagination guide
 * (https://x-series-api.lightspeedhq.com/v1.0/docs/pagination.md):
 *
 *   "The response to that request should include a collection of `0` to `n`
 *   resources. The upper limit will probably be different depending on the
 *   endpoint. The highest `version` number `x` from this collection (the
 *   `max` attribute above) should be used to request the next page like:
 *   /api/2.0/products?after=x ... This should be repeated until an empty
 *   collection is returned. This will mean that all items of the collection
 *   have been returned."
 *
 * The legacy 2.0 reference documents `after` ("The lower limit for the
 * version numbers to be included in the response."), `before` and
 * `page_size` ("The maximum number of items to be returned in the
 * response.") on every list path the adapter calls: GET /products,
 * /inventory, /outlets, /suppliers and /consignments (with `type`
 * SUPPLIER | OUTLET | STOCKTAKE | RETURN). No 2.0 maximum is documented: the
 * only "200 is the maximum value of the page_size parameter" sits under the
 * API 0.x heading.
 *
 * Before the fix every list method sent `after` only from `params.cursor`,
 * which the page contract never sets, so page 2 repeated page 1 and a sync
 * re-fetched the first page until its page cap.
 *
 * The end of a collection is an EMPTY collection, never a short one: the
 * endpoint may serve fewer rows than `page_size` asked for. So the last
 * non-empty page still reports `hasMore: true`, and the page after it is
 * empty with `hasMore: false`. Over N = 2L + 1 rows the worker therefore
 * walks four pages, `[true, true, true, false]`, which is exactly what the
 * platform reports; over N = 2L it walks three, `[true, true, false]`.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  declaredPageMax,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { VendPosAdapter } from '../../../../../../src/verticals/inventory/adapters/vend-pos/index'
import type { InventoryAdapter } from '../../../../../../src/verticals/inventory/adapter/interface'

const CREDS: Credentials = {
  accessToken: 'vend_access_a',
  refreshToken: 'vend_refresh_a',
  extra: { domainPrefix: 'mystore' },
}

/**
 * No case needs more than a few dozen upstream reads. A walk that keeps
 * paging past the end fails by name instead of hanging the suite.
 */
const CALL_BUDGET = 60

/** The query parameters the legacy 2.0 reference documents per list path. */
const COMMON = ['after', 'before', 'page_size']
const DOCUMENTED: Record<string, ReadonlySet<string>> = {
  '/products': new Set([...COMMON, 'deleted']),
  '/inventory': new Set(COMMON),
  '/outlets': new Set([...COMMON, 'deleted']),
  '/suppliers': new Set(COMMON),
  '/consignments': new Set([...COMMON, 'type', 'status', 'outlet_id']),
}

const CONSIGNMENT_TYPES = ['SUPPLIER', 'OUTLET', 'STOCKTAKE'] as const
type ConsignmentType = (typeof CONSIGNMENT_TYPES)[number]

type Row = Record<string, unknown> & { id: string; version: number }
type Lister = (credentials: Credentials, params: QueryParams) => Promise<Array<{ id: string }>>

interface Case {
  method:
    | 'listProducts'
    | 'listStockLevels'
    | 'listLocations'
    | 'listSuppliers'
    | 'listPurchaseOrders'
    | 'listStockTransfers'
    | 'listStockAdjustments'
  path: string
  prefix: string
  /** The consignment `type` the method filters on. */
  type?: ConsignmentType
  row: (i: number, version: number) => Row
}

const CASES: Case[] = [
  {
    method: 'listProducts',
    path: '/products',
    prefix: 'product',
    row: (i, version) => ({ id: `product-${i}`, name: `Product ${i}`, version }),
  },
  {
    method: 'listStockLevels',
    path: '/inventory',
    prefix: 'inventory',
    row: (i, version) => ({
      id: `inventory-${i}`,
      product_id: `product-${i}`,
      outlet_id: 'outlet-1',
      count: i,
      version,
    }),
  },
  {
    method: 'listLocations',
    path: '/outlets',
    prefix: 'outlet',
    row: (i, version) => ({ id: `outlet-${i}`, name: `Outlet ${i}`, version }),
  },
  {
    method: 'listSuppliers',
    path: '/suppliers',
    prefix: 'supplier',
    row: (i, version) => ({ id: `supplier-${i}`, name: `Supplier ${i}`, version }),
  },
  ...CONSIGNMENT_TYPES.map((type): Case => ({
    method:
      type === 'SUPPLIER'
        ? 'listPurchaseOrders'
        : type === 'OUTLET'
          ? 'listStockTransfers'
          : 'listStockAdjustments',
    path: '/consignments',
    prefix: type.toLowerCase(),
    type,
    row: (i, version) => consignment(type, i, version),
  })),
]

function consignment(type: ConsignmentType, i: number, version: number): Row {
  return {
    id: `${type.toLowerCase()}-${i}`,
    type,
    status: 'OPEN',
    outlet_id: 'outlet-1',
    source_outlet_id: 'outlet-2',
    supplier_id: 'supplier-1',
    version,
  }
}

/**
 * The version of row `i` of a collection: ascending, but neither a row
 * index nor a row offset, so a cursor built from either is caught.
 */
const versionOf = (i: number) => 5000 + i * 30

/**
 * The rows GET `c.path` holds. /consignments holds every type, interleaved in
 * version order, so a method that drops its `type` filter gets foreign rows.
 */
function collection(c: Case, n: number): Row[] {
  if (c.path !== '/consignments') {
    return Array.from({ length: n }, (_, k) => c.row(k + 1, versionOf(k + 1)))
  }
  const rows: Row[] = []
  for (let i = 1; i <= n; i++) {
    CONSIGNMENT_TYPES.forEach((t, j) => rows.push(consignment(t, i, versionOf(i) + j * 10)))
  }
  return rows
}

function ids(prefix: string, from: number, count: number): string[] {
  return Array.from({ length: count }, (_, k) => `${prefix}-${from + k}`)
}

interface FakeOptions {
  /**
   * The endpoint's own upper limit: "The upper limit will probably be
   * different depending on the endpoint." A request for more gets this many.
   */
  endpointMax?: number
  /**
   * `envelope`: `{ data, version: { min, max } }` as the pagination guide
   * shows. `no-version`: the envelope without `version`. `bare`: a bare array
   * of rows, the legacy consignments reference's 200 schema.
   */
  shape?: 'envelope' | 'no-version' | 'bare'
  /**
   * Collections per store, by domain prefix. A store not listed here holds
   * the collections passed to {@link fakeVend} directly.
   */
  stores?: Record<string, Record<string, Row[]>>
}

interface Call {
  /** The domain prefix the request went to. */
  store: string
  path: string
  params: Record<string, unknown>
  authorization: string
}

/**
 * A fake Lightspeed Retail X-Series API 2.0 that honours ONLY the documented
 * list parameters: `after` (rows whose version is above it, where `after=0`
 * is the same as no `after`), `before`,
 * `page_size` (at most that many rows) and, on /consignments, `type`. Any
 * other parameter is refused rather than silently ignored. Rows come back in
 * ascending version order ("Objects in returned collections will be sorted
 * by the version number in an ascending order.").
 */
function fakeVend(store: Record<string, Row[]>, opts: FakeOptions = {}) {
  const calls: Call[] = []
  vi.spyOn(axios, 'create').mockImplementation(((cfg?: {
    baseURL?: string
    headers?: Record<string, string>
  }) => {
    const authorization = String(cfg?.headers?.['Authorization'] ?? '')
    const host = new URL(String(cfg?.baseURL)).hostname.split('.')[0]!
    const collections = opts.stores?.[host] ?? store
    return {
      get: async (path: string, req?: { params?: Record<string, unknown> }) => {
        if (calls.length >= CALL_BUDGET) {
          throw new Error(`call budget (${CALL_BUDGET}) exceeded: the adapter kept paging`)
        }
        const params = Object.fromEntries(
          Object.entries(req?.params ?? {}).filter(([, v]) => v !== undefined),
        )
        calls.push({ store: host, path, params, authorization })
        const documented = DOCUMENTED[path]
        const rowsAt = collections[path]
        if (!documented || !rowsAt) throw new Error(`unexpected path ${path}`)
        for (const key of Object.keys(params)) {
          if (!documented.has(key)) throw new Error(`GET ${path} does not take \`${key}\``)
        }
        let rows = [...rowsAt].sort((a, b) => a.version - b.version)
        if (params['type'] !== undefined) rows = rows.filter((r) => r['type'] === params['type'])
        if (params['after'] !== undefined) {
          const after = Number(params['after'])
          // "For a request with no `after` parameter or `after=0`, the first
          // page of products will be returned, even if a resource with
          // `version = 0` may not exist in the given collection."
          if (after !== 0) rows = rows.filter((r) => r.version > after)
        }
        if (params['before'] !== undefined) {
          const before = Number(params['before'])
          rows = rows.filter((r) => r.version < before)
        }
        const asked = params['page_size'] === undefined ? 200 : Number(params['page_size'])
        const size = Math.min(asked, opts.endpointMax ?? Infinity)
        const data = rows.slice(0, size)
        const shape = opts.shape ?? 'envelope'
        if (shape === 'bare') return { data }
        if (shape === 'no-version') return { data: { data } }
        const version =
          data.length > 0 ? { min: data[0]!.version, max: data[data.length - 1]!.version } : null
        return { data: { data, version } }
      },
    }
  }) as never)
  return { calls }
}

const adapter = () =>
  new VendPosAdapter({
    clientId: 'cid',
    clientSecret: 'secret',
    redirectUri: 'https://app.example.com/cb',
  })
/** The adapter as the router holds it, for parseListQuery and declaredPageMax. */
const routed = (): InventoryAdapter => adapter()
const lister = (c: Case): Lister => {
  const a = adapter()
  return (a[c.method] as Lister).bind(a)
}

/** Drive a method as the sync worker does: withPageSink({ page, limit }). */
async function walk(call: Lister, limit: number, pages: number, creds: Credentials = CREDS) {
  const byPage: string[][] = []
  const hasMore: (boolean | undefined)[] = []
  for (let k = 1; k <= pages; k++) {
    const params = withPageSink({ page: k, limit })
    byPage.push((await call(creds, params)).map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { seen: byPage.flat(), byPage, hasMore }
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('vend-pos capabilities', () => {
  it('declares no maxPageSize: API 2.0 documents none', () => {
    expect(declaredPageMax(routed())).toBeUndefined()
  })
})

describe.each(CASES)('vend-pos $method paging (GET $path, version keyset)', (c) => {
  const L = 4
  const filters = c.type ? { type: c.type } : {}
  const store = (n: number, opts?: FakeOptions) => fakeVend({ [c.path]: collection(c, n) }, opts)

  it('N = 2L + 1: the worker serves every row once, and an empty page ends it', async () => {
    const N = 2 * L + 1
    const { calls } = store(N)
    const { seen, byPage, hasMore } = await walk(lister(c), L, 4)
    expect(seen).toEqual(ids(c.prefix, 1, N))
    expect(byPage.map((p) => p.length)).toEqual([L, L, 1, 0])
    // Page 3 is short but not empty: the platform has not said it is done.
    expect(hasMore).toEqual([true, true, true, false])
    // One request per page: the pager remembers where each page starts.
    expect(calls).toHaveLength(4)
  })

  it("page 2 asks for `after` = page 1's version.max, at the caller's page_size", async () => {
    const { calls } = store(2 * L + 1)
    await walk(lister(c), L, 3)
    const expectedVersion = (i: number) =>
      c.type ? versionOf(i) + CONSIGNMENT_TYPES.indexOf(c.type) * 10 : versionOf(i)
    expect(calls[0]).toMatchObject({ path: c.path, params: { page_size: L, ...filters } })
    expect(calls[0]!.params).not.toHaveProperty('after')
    expect(calls[1]).toMatchObject({
      path: c.path,
      params: { page_size: L, after: expectedVersion(L), ...filters },
    })
    expect(calls[2]!.params).toMatchObject({ page_size: L, after: expectedVersion(2 * L) })
  })

  it('N = 2L: page 2 is full, page 3 is empty and ends the collection', async () => {
    store(2 * L)
    const { seen, byPage, hasMore } = await walk(lister(c), L, 3)
    expect(seen).toEqual(ids(c.prefix, 1, 2 * L))
    expect(byPage[2]).toEqual([])
    expect(hasMore).toEqual([true, true, false])
  })

  it('a page past the end is empty with hasMore false, without another request', async () => {
    const { calls } = store(3)
    const { seen, hasMore } = await walk(lister(c), L, 3)
    expect(seen).toEqual(ids(c.prefix, 1, 3))
    expect(hasMore).toEqual([true, false, false])
    expect(calls).toHaveLength(2)
  })

  it('at the worker limit of 500, page_size is 500 on every request', async () => {
    const { calls } = store(501)
    const { seen, byPage, hasMore } = await walk(lister(c), 500, 3)
    expect(seen).toEqual(ids(c.prefix, 1, 501))
    expect(byPage.map((p) => p.length)).toEqual([500, 1, 0])
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((r) => r.params['page_size'])).toEqual([500, 500, 500])
  })
})

describe('vend-pos page sizes (no documented 2.0 maximum)', () => {
  const products = CASES[0]!
  const call = lister(products)

  it('an endpoint that serves fewer than page_size is not read as ending the collection', async () => {
    // "The upper limit will probably be different depending on the endpoint":
    // every page here is short, and only the empty one ends the walk.
    const { calls } = fakeVend({ '/products': collection(products, 9) }, { endpointMax: 3 })
    const { seen, byPage, hasMore } = await walk(call, 4, 4)
    expect(seen).toEqual(ids('product', 1, 9))
    expect(byPage.map((p) => p.length)).toEqual([3, 3, 3, 0])
    expect(hasMore).toEqual([true, true, true, false])
    expect(calls.every((r) => r.params['page_size'] === 4)).toBe(true)
  })

  it('walks every row at the worker limit of 500', async () => {
    fakeVend({ '/products': collection(products, 1200) })
    const { seen, hasMore } = await walk(call, 500, 4)
    expect(seen).toEqual(ids('product', 1, 1200))
    expect(hasMore).toEqual([true, true, true, false])
  })

  it('a limit above the router cap is clamped to 500 and every row is still served once', async () => {
    const { calls } = fakeVend({ '/products': collection(products, 1001) })
    const seen: string[] = []
    const hasMore: (boolean | null)[] = []
    for (let k = 1; k <= 4; k++) {
      const params = parseListQuery({ page: String(k), limit: '100000' }, routed())
      expect(params.limit).toBe(500)
      const env = listPage(await call(CREDS, params), params, 'vend-pos')
      expect(env.meta.limit).toBe(500)
      seen.push(...env.data.map((r) => r.id))
      hasMore.push(env.meta.hasMore)
    }
    expect(seen).toEqual(ids('product', 1, 1001))
    expect(hasMore).toEqual([true, true, true, false])
    expect(calls.every((r) => r.params['page_size'] === 500)).toBe(true)
  })

  it('walks with the limit exactly as parseListQuery delivers it', async () => {
    const { calls } = fakeVend({ '/products': collection(products, 15) })
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let k = 1; k <= 3; k++) {
      const params = parseListQuery({ page: String(k), limit: '7' }, routed())
      expect(params.limit).toBe(7)
      seen.push(...(await call(CREDS, params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids('product', 1, 15))
    expect(hasMore).toEqual([true, true, true])
    expect(calls.map((r) => r.params['page_size'])).toEqual([7, 7, 7])
  })

  it('a first request with no ?page (page undefined from parseListQuery) is page 1', async () => {
    const { calls } = fakeVend({ '/products': collection(products, 9) })
    const params = parseListQuery({ limit: '4' }, routed())
    expect(params.page).toBeUndefined()
    expect((await call(CREDS, params)).map((r) => r.id)).toEqual(ids('product', 1, 4))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(calls[0]!.params).toEqual({ page_size: 4 })
  })
})

describe('vend-pos API path: parseListQuery + listPage', () => {
  it('meta.hasMore follows the platform: true until an empty collection, then false', async () => {
    const products = CASES[0]!
    fakeVend({ '/products': collection(products, 9) })
    const call = lister(products)
    const metas: Array<{ page: number; limit: number; hasMore: boolean | null; n: number }> = []
    for (let k = 1; k <= 4; k++) {
      const params = parseListQuery({ page: String(k), limit: '4' }, routed())
      const env = listPage(await call(CREDS, params), params, 'vend-pos')
      metas.push({
        page: env.meta.page,
        limit: env.meta.limit,
        hasMore: env.meta.hasMore,
        n: env.data.length,
      })
    }
    expect(metas).toEqual([
      { page: 1, limit: 4, hasMore: true, n: 4 },
      { page: 2, limit: 4, hasMore: true, n: 4 },
      { page: 3, limit: 4, hasMore: true, n: 1 },
      { page: 4, limit: 4, hasMore: false, n: 0 },
    ])
  })
})

describe('vend-pos cursor derivation', () => {
  it('without a version envelope, the next `after` is the highest row version', async () => {
    const suppliers = CASES.find((c) => c.method === 'listSuppliers')!
    const { calls } = fakeVend({ '/suppliers': collection(suppliers, 9) }, { shape: 'no-version' })
    const { seen, hasMore } = await walk(lister(suppliers), 4, 4)
    expect(seen).toEqual(ids('supplier', 1, 9))
    expect(hasMore).toEqual([true, true, true, false])
    expect(calls[1]!.params['after']).toBe(versionOf(4))
  })

  it('reads the bare-array body the legacy consignments reference documents', async () => {
    const po = CASES.find((c) => c.method === 'listPurchaseOrders')!
    const { calls } = fakeVend({ '/consignments': collection(po, 9) }, { shape: 'bare' })
    const { seen, hasMore } = await walk(lister(po), 4, 4)
    expect(seen).toEqual(ids('supplier', 1, 9))
    expect(hasMore).toEqual([true, true, true, false])
    expect(calls[1]!.params).toEqual({ page_size: 4, type: 'SUPPLIER', after: versionOf(4) })
  })

  // The date-versioned reference's supplier example carries "version": 0 on
  // every row under a version envelope of max 0 / min 0. `after=0` is the same
  // request as no `after`, so a cursor of 0 would ask for page 1 again.
  const atVersionZero = (n: number) =>
    Array.from({ length: n }, (_, k) => ({
      id: `supplier-${k + 1}`,
      name: `Supplier ${k + 1}`,
      version: 0,
    }))
  const suppliers = CASES.find((c) => c.method === 'listSuppliers')!

  it("the reference's three suppliers at version 0 are each served once, from one request", async () => {
    const { calls } = fakeVend({ '/suppliers': atVersionZero(3) })
    const { byPage, hasMore } = await walk(lister(suppliers), 500, 2)
    expect(byPage).toEqual([ids('supplier', 1, 3), []])
    expect(hasMore).toEqual([false, false])
    expect(calls.map((r) => r.params)).toEqual([{ page_size: 500 }])
  })

  it('a full page that cannot move `after` forward is served, then the next page refuses', async () => {
    // supplier-5..9 exist, but no `after` can reach them. Ending here would
    // report the collection complete; asking with after=0 would serve
    // supplier-1..4 again.
    const { calls } = fakeVend({ '/suppliers': atVersionZero(9) })
    const call = lister(suppliers)
    const first = withPageSink({ page: 1, limit: 4 })
    expect((await call(CREDS, first)).map((r) => r.id)).toEqual(ids('supplier', 1, 4))
    expect(readUpstreamPage(first)?.hasMore).toBe(true)
    await expect(call(CREDS, withPageSink({ page: 2, limit: 4 }))).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringContaining('past version 0'),
    })
    // Refused before sending anything.
    expect(calls).toHaveLength(1)
  })
})

describe('vend-pos pager keys', () => {
  it('purchase orders and stock transfers on one connection keep separate positions', async () => {
    const po = CASES.find((c) => c.method === 'listPurchaseOrders')!
    const transfers = CASES.find((c) => c.method === 'listStockTransfers')!
    // Disjoint version ranges: a transfer cursor (1004) handed to purchase
    // orders (100..900) would skip every one of them.
    fakeVend({
      '/consignments': [
        ...Array.from({ length: 9 }, (_, k) => consignment('SUPPLIER', k + 1, 100 * (k + 1))),
        ...Array.from({ length: 9 }, (_, k) => consignment('OUTLET', k + 1, 1000 + k + 1)),
      ],
    })
    const listPo = lister(po)
    const listTransfers = lister(transfers)
    const page = async (call: Lister, k: number) =>
      (await call(CREDS, withPageSink({ page: k, limit: 4 }))).map((r) => r.id)
    // Interleaved, as two resources of one sync can be.
    expect(await page(listPo, 1)).toEqual(ids('supplier', 1, 4))
    expect(await page(listTransfers, 1)).toEqual(ids('outlet', 1, 4))
    expect(await page(listPo, 2)).toEqual(ids('supplier', 5, 4))
    expect(await page(listTransfers, 2)).toEqual(ids('outlet', 5, 4))
  })

  it('products and suppliers on one connection keep separate positions', async () => {
    const products = CASES[0]!
    const suppliers = CASES.find((c) => c.method === 'listSuppliers')!
    // Disjoint version ranges: a supplier cursor (5004) handed to products
    // (100..900) would skip every one of them.
    fakeVend({
      '/products': Array.from({ length: 9 }, (_, k) => products.row(k + 1, 100 * (k + 1))),
      '/suppliers': Array.from({ length: 9 }, (_, k) => suppliers.row(k + 1, 5000 + k + 1)),
    })
    const listProducts = lister(products)
    const listSuppliers = lister(suppliers)
    const page = async (call: Lister, k: number) =>
      (await call(CREDS, withPageSink({ page: k, limit: 4 }))).map((r) => r.id)
    expect(await page(listProducts, 1)).toEqual(ids('product', 1, 4))
    expect(await page(listSuppliers, 1)).toEqual(ids('supplier', 1, 4))
    expect(await page(listProducts, 2)).toEqual(ids('product', 5, 4))
    expect(await page(listSuppliers, 2)).toEqual(ids('supplier', 5, 4))
  })

  it('a different page size does not reuse a cursor minted at another', async () => {
    const products = CASES[0]!
    fakeVend({ '/products': collection(products, 12) })
    const call = lister(products)
    await call(CREDS, withPageSink({ page: 1, limit: 4 }))
    const page2 = await call(CREDS, withPageSink({ page: 2, limit: 3 }))
    expect(page2.map((r) => r.id)).toEqual(ids('product', 4, 3))
  })

  it("a second connection to the same store walks with its own token, not the first one's cursors", async () => {
    const products = CASES[0]!
    const { calls } = fakeVend({ '/products': collection(products, 12) })
    const call = lister(products)
    const other: Credentials = {
      accessToken: 'vend_access_b',
      refreshToken: 'vend_refresh_b',
      extra: { domainPrefix: 'mystore' },
    }
    await walk(call, 4, 2)
    calls.length = 0
    const page2 = await call(other, withPageSink({ page: 2, limit: 4 }))
    expect(page2.map((r) => r.id)).toEqual(ids('product', 5, 4))
    // Page 2 for the new connection starts from its own page 1.
    expect(calls).toHaveLength(2)
    expect(calls[0]!.params).toEqual({ page_size: 4 })
    expect(calls.every((r) => r.authorization === 'Bearer vend_access_b')).toBe(true)
  })

  it('two stores behind the same tokens keep separate positions', async () => {
    const products = CASES[0]!
    // Disjoint version ranges: a cursor from store A (104) handed to store B
    // (5001..5009) would serve B's page 1 as its page 2.
    const { calls } = fakeVend(
      {},
      {
        stores: {
          'store-a': {
            '/products': Array.from({ length: 9 }, (_, k) => products.row(k + 1, 100 + k + 1)),
          },
          'store-b': {
            '/products': Array.from({ length: 9 }, (_, k) => products.row(k + 1, 5000 + k + 1)),
          },
        },
      },
    )
    const call = lister(products)
    const at = (store: string): Credentials => ({ ...CREDS, extra: { domainPrefix: store } })
    await walk(call, 4, 2, at('store-a'))
    calls.length = 0
    const page2 = await call(at('store-b'), withPageSink({ page: 2, limit: 4 }))
    expect(page2.map((r) => r.id)).toEqual(ids('product', 5, 4))
    expect(calls.map((r) => [r.store, r.params['after']])).toEqual([
      ['store-b', undefined],
      ['store-b', 5004],
    ])
  })
})
