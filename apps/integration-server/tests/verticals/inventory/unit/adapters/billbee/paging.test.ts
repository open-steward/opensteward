/**
 * Paging for Billbee's three list methods, against its own Swagger
 * (https://app.billbee.io/swagger/docs/v1) and first-party SDK
 * (billbeeio/billbee-csharp-sdk).
 *
 * - GET /api/v1/products/stocks ("Query all defined stock locations",
 *   operationId Article_GetStocks) takes no parameters at all and answers with
 *   `ApiResult<List<StockResponseData>>`: every location, no Paging block. The
 *   adapter used to return that whole list for every page, so the router
 *   truncated each response to `limit` and page 2 repeated page 1. It now
 *   slices the list itself and reports the total.
 * - GET /api/v1/products takes `page` ("starting with 1") and `pageSize`
 *   ("Values between 1 and 250 are allowed", default 50), and answers with a
 *   Paging block of Page, TotalPages and TotalRows. The adapter clamped to 250
 *   without declaring it, so the sync asked for 500, got 250 and stopped there.
 *   It now declares `maxPageSize` 250 and reports Billbee's own end.
 * - Stock levels are the products' Stocks[] flattened, so one page of products
 *   is not one caller page. The rows past `limit` on each page used to be
 *   truncated and never served. They are now cut with `pageByRows`.
 *
 * The fake upstream honours only what the spec documents, so any paging the
 * locations list appears to do is the adapter's.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { BillbeeAdapter } from '../../../../../../src/verticals/inventory/adapters/billbee'
import type { InventoryAdapter } from '../../../../../../src/verticals/inventory/adapter/interface'

/** One deployment's API key: it names the application, so every connection shares it. */
const API_KEY = 'app-api-key'

function creds(username = 'owner@example.test', apiPassword = 'api-password'): Credentials {
  return { accessToken: API_KEY, extra: { username, apiPassword } }
}

const CREDS = creds()

interface Call {
  /** The Basic-auth login the request was sent with. */
  user: string
  password: string
  path: string
  params: Record<string, unknown> | undefined
}

interface FakeOptions {
  /** Stock locations the account holds. */
  locations?: number
  /** Each product's Stocks[] length, per Billbee username. */
  catalog?: (user: string) => number[]
  /** Leave the Paging block out of /products responses. */
  noPaging?: boolean
  /** Replaces the status fields and Data of every response: a 200 that carries an error. */
  body?: Record<string, unknown>
}

function product(i: number, stocks: number) {
  return {
    Id: 1000 + i,
    SKU: `SKU-${i}`,
    StockCurrent: i,
    Stocks: Array.from({ length: stocks }, (_, s) => ({
      StockId: s + 1,
      Name: `Lager ${s + 1}`,
      StockCurrent: 10 * i + s,
    })),
  }
}

/** A fake Billbee. `/products/stocks` returns every location on every call. */
function fakeBillbee(opts: FakeOptions): Call[] {
  const calls: Call[] = []
  const locations = Array.from({ length: opts.locations ?? 0 }, (_, i) => ({
    Id: 100 + i,
    Name: `Lager ${i}`,
    Description: null,
    IsDefault: i === 0,
  }))
  const respond = (
    { username: user, password }: { username: string; password: string },
    path: string,
    params: Record<string, unknown> | undefined,
  ) => {
    calls.push({ user, password, path, params })
    if (opts.body) return { data: opts.body }
    if (path === '/products/stocks') {
      // Documented parameters: none. Anything the adapter sends is ignored.
      return { data: { ErrorMessage: null, ErrorCode: 0, Data: locations } }
    }
    if (path === '/products') {
      const page = Number(params?.['page'] ?? 1)
      const pageSize = Number(params?.['pageSize'] ?? 50)
      if (!Number.isInteger(page) || page < 1) throw new Error(`page ${page} is not a page`)
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 250)
        throw new Error(`pageSize ${pageSize} is outside 1..250`)
      const all = (opts.catalog?.(user) ?? []).map((n, i) => product(i, n))
      const data = all.slice((page - 1) * pageSize, page * pageSize)
      const paging = {
        Page: page,
        TotalPages: Math.ceil(all.length / pageSize),
        TotalRows: all.length,
        PageSize: pageSize,
      }
      return {
        data: {
          ErrorMessage: null,
          ErrorCode: 0,
          Data: data,
          ...(opts.noPaging ? {} : { Paging: paging }),
        },
      }
    }
    throw new Error(`unexpected path ${path}`)
  }
  type Auth = { username: string; password: string }
  vi.spyOn(axios, 'create').mockImplementation(((cfg: { auth: Auth }) => ({
    get: vi.fn(async (path: string, c?: { params?: Record<string, unknown> }) =>
      respond(cfg.auth, path, c?.params),
    ),
  })) as never)
  return calls
}

/** The router's parse, with the adapter typed as the router holds it. */
function parse(query: Record<string, string>): QueryParams {
  const routed: InventoryAdapter = new BillbeeAdapter()
  return parseListQuery(query, routed)
}

const locationIds = (n: number) => Array.from({ length: n }, (_, i) => String(100 + i))
const productIds = (n: number) => Array.from({ length: n }, (_, i) => String(1000 + i))

/** The stock-level ids a catalogue flattens to, in order. */
function levelIds(catalog: number[]): string[] {
  return catalog.flatMap((n, i) =>
    n === 0 ? [`${1000 + i}:0`] : Array.from({ length: n }, (_, s) => `${1000 + i}:${s + 1}`),
  )
}

type ListMethod = 'listLocations' | 'listProducts' | 'listStockLevels'

/** Page through a list method the way the sync worker does. */
async function drive(method: ListMethod, limit: number, pages: number, credentials = CREDS) {
  const adapter = new BillbeeAdapter()
  const seen: string[] = []
  const sizes: number[] = []
  const hasMore: Array<boolean | undefined> = []
  const totals: Array<number | undefined> = []
  const local: Array<boolean | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params: QueryParams = withPageSink({ page, limit })
    const rows = await adapter[method](credentials, params)
    seen.push(...rows.map((r) => r.id))
    sizes.push(rows.length)
    const meta = readUpstreamPage(params)
    hasMore.push(meta?.hasMore)
    totals.push(meta?.totalCount)
    local.push(meta?.pagedLocally)
  }
  return { seen, sizes, hasMore, totals, local }
}

/** Page through a list method the way the API router does. */
async function viaApi(method: ListMethod, limit: number, pages: number) {
  const adapter = new BillbeeAdapter()
  const out = []
  for (let page = 1; page <= pages; page++) {
    const params = parse({ limit: String(limit), page: String(page) })
    const rows: Array<{ id: string }> = await adapter[method](CREDS, params)
    const env = listPage(rows, params, 'billbee')
    out.push({ ids: env.data.map((r) => r.id), hasMore: env.meta.hasMore })
  }
  return out
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('BillbeeAdapter declares the documented page maximum', () => {
  it('asks for at most 250 rows on every path', () => {
    expect(new BillbeeAdapter().capabilities.maxPageSize).toBe(250)
    expect(parse({ limit: '1000' }).limit).toBe(250)
    expect(parse({ limit: '100' }).limit).toBe(100)
  })
})

describe('BillbeeAdapter.listLocations pages the whole list locally', () => {
  it('serves 2L + 1 locations once each over three pages, ending on the third', async () => {
    const L = 3
    const calls = fakeBillbee({ locations: 2 * L + 1 })
    const { seen, sizes, hasMore, totals, local } = await drive('listLocations', L, 3)
    expect(seen).toEqual(locationIds(2 * L + 1))
    expect(sizes).toEqual([3, 3, 1])
    expect(hasMore).toEqual([true, true, false])
    expect(totals).toEqual([7, 7, 7])
    expect(local).toEqual([true, true, true])
    // Page 2 asks the upstream exactly what page 1 did: the endpoint has no
    // paging parameters, so none may be invented.
    expect(calls).toHaveLength(3)
    for (const call of calls) {
      expect(call.path).toBe('/products/stocks')
      expect(call.params ?? {}).toEqual({})
    }
  })

  it('ends on page 2 when the list is exactly 2L long', async () => {
    const L = 4
    fakeBillbee({ locations: 2 * L })
    const { seen, hasMore } = await drive('listLocations', L, 3)
    expect(seen).toEqual(locationIds(2 * L))
    expect(hasMore).toEqual([true, false, false])
  })

  it('serves every location at the largest limit the router lets through', async () => {
    // The endpoint has no maximum of its own; the router caps at the declared 250.
    fakeBillbee({ locations: 601 })
    const adapter = new BillbeeAdapter()
    const pages = []
    for (const page of ['1', '2', '3']) {
      const params = parse({ limit: '1000', page })
      expect(params.limit).toBe(250)
      const rows = await adapter.listLocations(CREDS, params)
      pages.push(rows)
      expect(readUpstreamPage(params)).toMatchObject({ totalCount: 601 })
    }
    expect(pages.map((p) => p.length)).toEqual([250, 250, 101])
    expect(pages.flat().map((r) => r.id)).toEqual(locationIds(601))
  })

  it('pages at the limit parseListQuery delivers', async () => {
    fakeBillbee({ locations: 5 })
    const adapter = new BillbeeAdapter()
    const seen: string[] = []
    for (const page of ['1', '2', '3']) {
      const params = parse({ limit: '2', page })
      expect(params.limit).toBe(2)
      seen.push(...(await adapter.listLocations(CREDS, params)).map((r) => r.id))
    }
    expect(seen).toEqual(locationIds(5))
  })

  it('reports an exact hasMore on the API path', async () => {
    fakeBillbee({ locations: 7 })
    const adapter = new BillbeeAdapter()
    const metas = []
    for (const page of ['1', '2', '3']) {
      const params = parse({ limit: '3', page })
      const env = listPage(await adapter.listLocations(CREDS, params), params, 'billbee')
      metas.push({
        ids: env.data.map((r) => r.id),
        hasMore: env.meta.hasMore,
        total: env.meta.totalCount,
      })
    }
    expect(metas).toEqual([
      { ids: ['100', '101', '102'], hasMore: true, total: 7 },
      { ids: ['103', '104', '105'], hasMore: true, total: 7 },
      { ids: ['106'], hasMore: false, total: 7 },
    ])
  })

  it('returns every location when the caller names no limit', async () => {
    // More rows than any default page size or the router's ceiling, so a
    // hidden default limit cannot pass.
    fakeBillbee({ locations: 601 })
    const params = withPageSink({})
    const rows = await new BillbeeAdapter().listLocations(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(locationIds(601))
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, totalCount: 601 })
  })

  it('getLocation still finds a location past the first page', async () => {
    fakeBillbee({ locations: 250 })
    const found = await new BillbeeAdapter().getLocation(CREDS, '349')
    expect(found.name).toBe('Lager 249')
  })

  it('getLocation refuses an id the account does not hold', async () => {
    fakeBillbee({ locations: 3 })
    await expect(new BillbeeAdapter().getLocation(CREDS, '999')).rejects.toThrow(
      'billbee: location 999 not found',
    )
  })

  it('reads a success body without Data as no locations', async () => {
    fakeBillbee({ body: { ErrorMessage: null, ErrorCode: 0 } })
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await new BillbeeAdapter().listLocations(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, totalCount: 0 })
  })
})

describe('A 200 that carries a Billbee error is an error, not an empty list', () => {
  const failures: Array<[string, Record<string, unknown>]> = [
    ['a non-zero ErrorCode', { ErrorCode: 8, ErrorMessage: null }],
    ['an ErrorMessage', { ErrorCode: 0, ErrorMessage: 'API service not booked' }],
  ]

  for (const [what, body] of failures) {
    it(`throws on ${what} from every list method and getLocation`, async () => {
      fakeBillbee({ body })
      const adapter = new BillbeeAdapter()
      for (const method of ['listLocations', 'listProducts', 'listStockLevels'] as const) {
        const params = withPageSink({ page: 1, limit: 10 })
        await expect(adapter[method](CREDS, params)).rejects.toThrow(/billbee: GET \/products/)
        expect(readUpstreamPage(params)).toBeUndefined()
      }
      await expect(adapter.getLocation(CREDS, '100')).rejects.toThrow(
        /billbee: GET \/products\/stocks failed/,
      )
    })
  }

  it('names the ErrorCode and message', async () => {
    fakeBillbee({ body: { ErrorCode: 16, ErrorMessage: ' No paid account ' } })
    await expect(new BillbeeAdapter().listLocations(CREDS, {})).rejects.toThrow(
      'billbee: GET /products/stocks failed with ErrorCode 16: No paid account',
    )
  })
})

describe('BillbeeAdapter.listProducts pages by Billbee page and pageSize', () => {
  it('syncs 601 products in pages of 250, ending where Billbee says', async () => {
    const calls = fakeBillbee({ catalog: () => Array(601).fill(1) })
    const { seen, sizes, hasMore, totals } = await drive('listProducts', 250, 3)
    expect(seen).toEqual(productIds(601))
    expect(sizes).toEqual([250, 250, 101])
    expect(hasMore).toEqual([true, true, false])
    expect(totals).toEqual([601, 601, 601])
    expect(calls.map((c) => c.params)).toEqual([
      { page: 1, pageSize: 250 },
      { page: 2, pageSize: 250 },
      { page: 3, pageSize: 250 },
    ])
  })

  it('ends on a full last page without asking for another', async () => {
    fakeBillbee({ catalog: () => Array(500).fill(1) })
    const { hasMore, sizes } = await drive('listProducts', 250, 2)
    expect(sizes).toEqual([250, 250])
    expect(hasMore).toEqual([true, false])
  })

  it('sends the caller limit as pageSize', async () => {
    const calls = fakeBillbee({ catalog: () => Array(9).fill(1) })
    const { seen, hasMore } = await drive('listProducts', 4, 3)
    expect(seen).toEqual(productIds(9))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c.params)).toEqual([
      { page: 1, pageSize: 4 },
      { page: 2, pageSize: 4 },
      { page: 3, pageSize: 4 },
    ])
  })

  it('reports no end when the Paging block is missing', async () => {
    fakeBillbee({ catalog: () => Array(9).fill(1), noPaging: true })
    const params = withPageSink({ page: 1, limit: 4 })
    expect(await new BillbeeAdapter().listProducts(CREDS, params)).toHaveLength(4)
    expect(readUpstreamPage(params)?.hasMore).toBeUndefined()
    expect(readUpstreamPage(params)?.totalCount).toBeUndefined()
  })

  it('reports the 250 it sent when a direct call asks for more', async () => {
    const calls = fakeBillbee({ catalog: () => Array(300).fill(1) })
    const adapter = new BillbeeAdapter()
    const over = withPageSink({ page: 1, limit: 500 })
    expect(await adapter.listProducts(CREDS, over)).toHaveLength(250)
    expect(readUpstreamPage(over)).toMatchObject({ pageSize: 250, hasMore: true })
    const under = withPageSink({ page: 1, limit: 100 })
    await adapter.listProducts(CREDS, under)
    expect(readUpstreamPage(under)?.pageSize).toBeUndefined()
    expect(calls.map((c) => c.params?.['pageSize'])).toEqual([250, 100])
  })

  it('reports an exact hasMore on the API path', async () => {
    fakeBillbee({ catalog: () => Array(4).fill(1) })
    expect(await viaApi('listProducts', 2, 2)).toEqual([
      { ids: ['1000', '1001'], hasMore: true },
      { ids: ['1002', '1003'], hasMore: false },
    ])
  })
})

describe('BillbeeAdapter.listStockLevels cuts caller pages out of flattened products', () => {
  it('serves every stock level once at the sync page size, across product pages', async () => {
    // 300 products with 2 warehouses each: 600 rows from two pages of products.
    const catalog = Array<number>(300).fill(2)
    const calls = fakeBillbee({ catalog: () => catalog })
    const { seen, sizes, hasMore, local } = await drive('listStockLevels', 250, 3)
    expect(seen).toEqual(levelIds(catalog))
    expect(sizes).toEqual([250, 250, 100])
    expect(hasMore).toEqual([true, true, false])
    expect(local).toEqual([true, true, true])
    for (const call of calls) {
      expect(call.path).toBe('/products')
      expect(call.params?.['pageSize']).toBe(250)
    }
    // The second page of products is where rows 250 to 599 come from.
    expect(calls.map((c) => c.params?.['page'])).toContain(2)
  })

  it('serves products with several, one or no warehouses at a small limit', async () => {
    const catalog = [2, 0, 3, 1, 1]
    const calls = fakeBillbee({ catalog: () => catalog })
    const { seen, sizes, hasMore } = await drive('listStockLevels', 3, 3)
    expect(seen).toEqual(levelIds(catalog))
    expect(seen).toContain('1001:0')
    expect(sizes).toEqual([3, 3, 2])
    expect(hasMore).toEqual([true, true, false])
    // Product pages are 250 at every caller limit, the size the pager key names.
    expect(calls.map((c) => c.params)).toContainEqual({ page: 1, pageSize: 250 })
    for (const call of calls) expect(call.params?.['pageSize']).toBe(250)
  })

  it('ends on page 2 when the rows are exactly 2L', async () => {
    fakeBillbee({ catalog: () => [1, 2, 1] })
    const { seen, hasMore } = await drive('listStockLevels', 2, 2)
    expect(seen).toEqual(levelIds([1, 2, 1]))
    expect(hasMore).toEqual([true, false])
  })

  it('reports an exact hasMore on the API path', async () => {
    const catalog = [3, 3, 3]
    fakeBillbee({ catalog: () => catalog })
    const pages = await viaApi('listStockLevels', 4, 3)
    expect(pages.map((p) => p.ids)).toEqual([
      levelIds(catalog).slice(0, 4),
      levelIds(catalog).slice(4, 8),
      levelIds(catalog).slice(8),
    ])
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
  })

  it('falls back to a full page of products when Billbee sends no Paging block', async () => {
    const catalog = Array<number>(260).fill(1)
    fakeBillbee({ catalog: () => catalog, noPaging: true })
    const { seen, sizes, hasMore } = await drive('listStockLevels', 250, 2)
    expect(seen).toEqual(levelIds(catalog))
    expect(sizes).toEqual([250, 10])
    expect(hasMore).toEqual([true, false])
  })

  it('ends after a full last page of products with no Paging block', async () => {
    fakeBillbee({ catalog: () => Array<number>(250).fill(1), noPaging: true })
    const { sizes, hasMore } = await drive('listStockLevels', 250, 1)
    expect(sizes).toEqual([250])
    expect(hasMore).toEqual([false])
  })

  it('serves a default page when the caller names no limit', async () => {
    fakeBillbee({ catalog: () => Array<number>(60).fill(1) })
    const params = withPageSink({})
    const rows = await new BillbeeAdapter().listStockLevels(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(levelIds(Array(60).fill(1)).slice(0, 50))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it("never serves one Billbee user's rows to another on the same API key", async () => {
    const calls = fakeBillbee({
      catalog: (user) => (user === 'a@example.test' ? [2, 2] : [1, 1, 1, 1]),
    })
    const adapter = new BillbeeAdapter()
    // The key is the deployment's, and nothing stops two users picking the
    // same API password: only the username tells these connections apart.
    const a = creds('a@example.test', 'same-password')
    const b = creds('b@example.test', 'same-password')
    const p1 = withPageSink({ page: 1, limit: 2 })
    expect((await adapter.listStockLevels(a, p1)).map((r) => r.id)).toEqual(['1000:1', '1000:2'])
    const p2 = withPageSink({ page: 2, limit: 2 })
    expect((await adapter.listStockLevels(b, p2)).map((r) => r.id)).toEqual(['1002:1', '1003:1'])
    expect(calls.at(-1)?.user).toBe('b@example.test')
  })

  it('never serves rows fetched under an API password the caller does not hold', async () => {
    const calls = fakeBillbee({ catalog: () => [2, 2] })
    const adapter = new BillbeeAdapter()
    const before = withPageSink({ page: 1, limit: 2 })
    await adapter.listStockLevels(creds('owner@example.test', 'old-password'), before)
    // Page 2 is still in the reuse slot for the old password. The new one
    // must ask Billbee itself rather than be handed those rows.
    const after = withPageSink({ page: 2, limit: 2 })
    const rows = await adapter.listStockLevels(creds('owner@example.test', 'new-password'), after)
    expect(rows.map((r) => r.id)).toEqual(['1001:1', '1001:2'])
    expect(calls.at(-1)?.password).toBe('new-password')
  })
})

/**
 * A walk the way the sync worker walks: page 1, 2, … at one limit, on until
 * the adapter reports `hasMore: false`. The router caps a request at the
 * declared 250, so only a direct call can ask for 500. `hasMore` must be
 * reported on every page, never left to a short-page guess.
 */
async function walk(method: ListMethod, limit: number, maxPages = 20) {
  const adapter = new BillbeeAdapter()
  const pages: Array<{ ids: string[]; hasMore?: boolean; pageSize?: number; local?: boolean }> = []
  for (let page = 1; page <= maxPages; page++) {
    const params: QueryParams = withPageSink({ page, limit })
    const rows = await adapter[method](CREDS, params)
    const meta = readUpstreamPage(params)
    pages.push({
      ids: rows.map((r) => r.id),
      hasMore: meta?.hasMore,
      pageSize: meta?.pageSize,
      local: meta?.pagedLocally,
    })
    if (meta?.hasMore !== true) break
  }
  return pages
}

/** Each page's `hasMore` is true exactly when rows remain after it. */
function exactHasMore(pages: ReadonlyArray<{ ids: string[] }>, total: number): boolean[] {
  let served = 0
  return pages.map((p) => (served += p.ids.length) < total)
}

describe('A walk at limit 500 over 1,201 rows, against pages of at most 250', () => {
  const N = 1201

  it('the fake refuses a pageSize above the documented 250', async () => {
    // Otherwise the walks below could pass by asking Billbee for 500.
    fakeBillbee({ catalog: () => [1] })
    const client = axios.create({ auth: { username: 'u', password: 'p' } } as never) as unknown as {
      get: (path: string, c: { params: Record<string, unknown> }) => Promise<unknown>
    }
    await expect(client.get('/products', { params: { page: 1, pageSize: 251 } })).rejects.toThrow(
      'pageSize 251 is outside 1..250',
    )
  })

  it('listProducts serves every product once, in order, at the 250 it reports', async () => {
    const calls = fakeBillbee({ catalog: () => Array<number>(N).fill(1) })
    const pages = await walk('listProducts', 500)
    expect(pages.flatMap((p) => p.ids)).toEqual(productIds(N))
    expect(pages.map((p) => p.ids.length)).toEqual([250, 250, 250, 250, 201])
    expect(pages.map((p) => p.hasMore)).toEqual(exactHasMore(pages, N))
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, true, true, false])
    // Page N at a limit above the maximum is Billbee's page N at 250, and says
    // so: every reader judges the page at the size it reports.
    for (const p of pages) expect(p.pageSize).toBe(250)
    // One request per Billbee page, none past the end.
    expect(calls.map((c) => c.params)).toEqual(
      [1, 2, 3, 4, 5].map((page) => ({ page, pageSize: 250 })),
    )
  })

  it('listStockLevels serves every row once, in order, in pages of 500', async () => {
    // One warehouse per product: 1,201 rows over five Billbee pages.
    const catalog = Array<number>(N).fill(1)
    const calls = fakeBillbee({ catalog: () => catalog })
    const pages = await walk('listStockLevels', 500)
    expect(pages.flatMap((p) => p.ids)).toEqual(levelIds(catalog))
    expect(pages.map((p) => p.ids.length)).toEqual([500, 500, 201])
    expect(pages.map((p) => p.hasMore)).toEqual(exactHasMore(pages, N))
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
    // It serves the whole 500 asked for, so it reports no smaller size.
    for (const p of pages) {
      expect(p.pageSize).toBeUndefined()
      expect(p.local).toBe(true)
    }
    // Each Billbee page fetched once, at 250: the page a caller page ends
    // on is kept and carries the next caller page.
    expect(calls.map((c) => c.params)).toEqual(
      [1, 2, 3, 4, 5].map((page) => ({ page, pageSize: 250 })),
    )
  })

  it('listStockLevels cuts caller pages across product and Billbee page boundaries', async () => {
    // 171 × [1, 3, 0, 2] + [1, 3]: 686 products, 1,201 rows (a product with no
    // Stocks[] is one aggregate row), three Billbee pages (250, 250, 186
    // products). Both caller-page cuts split a product, and each of the first
    // two caller pages spans two Billbee pages. Both are asserted, not assumed.
    const catalog = [...Array<number[]>(171).fill([1, 3, 0, 2]).flat(), 1, 3]
    const want = levelIds(catalog)
    expect(want).toHaveLength(N)
    const productOf = (row: number) => want[row]?.split(':')[0]
    for (const cut of [500, 1000]) {
      // The last row of one caller page and the first of the next share a product.
      expect(productOf(cut - 1), `cut at ${cut}`).toBe(productOf(cut))
    }
    const billbeePageOf = (row: number) => Math.floor((Number(productOf(row)) - 1000) / 250) + 1
    const spans = [
      [0, 499],
      [500, 999],
      [1000, 1200],
    ].map(([first, last]) => [billbeePageOf(first ?? 0), billbeePageOf(last ?? 0)])
    expect(spans).toEqual([
      [1, 2],
      [2, 3],
      [3, 3],
    ])
    const calls = fakeBillbee({ catalog: () => catalog })
    const pages = await walk('listStockLevels', 500)
    expect(pages.flatMap((p) => p.ids)).toEqual(want)
    expect(pages.map((p) => p.ids.length)).toEqual([500, 500, 201])
    expect(pages.map((p) => p.hasMore)).toEqual(exactHasMore(pages, N))
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
    for (const call of calls) expect(call.params?.['pageSize']).toBe(250)
    expect(calls.map((c) => c.params?.['page'])).toEqual([1, 2, 3])
  })

  it('the API asks for 250 at limit=500 and walks both lists to an exact end', async () => {
    fakeBillbee({ catalog: () => Array<number>(N).fill(1) })
    for (const method of ['listProducts', 'listStockLevels'] as const) {
      _resetCursorPager()
      const adapter = new BillbeeAdapter()
      const seen: string[] = []
      const hasMore: Array<boolean | null> = []
      for (let page = 1; page <= 10; page++) {
        const params = parse({ limit: '500', page: String(page) })
        expect(params.limit).toBe(250)
        const rows: Array<{ id: string }> = await adapter[method](CREDS, params)
        const env = listPage(rows, params, 'billbee')
        expect(env.meta.limit).toBe(250)
        seen.push(...env.data.map((r) => r.id))
        hasMore.push(env.meta.hasMore)
        if (env.meta.hasMore !== true) break
      }
      const want = method === 'listProducts' ? productIds(N) : levelIds(Array(N).fill(1))
      expect(seen, method).toEqual(want)
      expect(hasMore, method).toEqual([true, true, true, true, false])
    }
  })
})
