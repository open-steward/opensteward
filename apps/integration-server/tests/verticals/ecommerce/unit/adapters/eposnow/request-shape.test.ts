/**
 * Epos Now list paging: 1-based `page` + caller's `limit` → Epos Now's `page`.
 *
 * Epos Now V4 pages by page number only, at a FIXED 200 rows per page, and has
 * no page-size parameter. From the V4 swagger that backs
 * https://developer.eposnowhq.com/Docs/Global
 * (https://developer.eposnowhq.com/docs/v4/json), on every list endpoint below:
 *
 *   "Supports pagination via <strong>page</strong> parameter. 200 response items per page."
 *   "Not providing <strong>page</strong> will return items for page 1."
 *
 * The caller's limit therefore cannot be sent. The adapter reads the upstream
 * page(s) holding the caller's rows and slices out exactly those rows — a
 * window can span two upstream pages — and declares `maxPageSize: 200` so the
 * sync worker pages one upstream page at a time.
 *
 * `page` is optional upstream ("Not providing page will return items for page
 * 1"), so the fake reads a missing `page` as 1 and the assertions compare the
 * page SERVED, not whether `page=1` was spelled out.
 *
 * `hasMore` is reported only when the fetched rows prove it: rows past the
 * window mean more, a short upstream page ending inside the window means the
 * end. A window ending exactly on a full upstream page is left undecided.
 * Every page reports `pagedLocally`, which is what tells the paging gate that
 * two caller pages inside one upstream page repeat `page` by design.
 *
 * listInventoryLevels reads the documented GET /api/v4/ProductStock ("Get all
 * product stocks." with the same two sentences), not the undocumented `Stock`:
 * a ProductStock row is one product at one location (`ProductId`,
 * `LocationId`), its quantity held in `ProductStockBatches[].CurrentStock`.
 * Its level id is `<ProductId>:<LocationId>`, which getInventoryLevel reads
 * back through the documented GET /api/v4/ProductStock/Product/{productId}/Location/{locationId}
 * ("Get Stocks for a Product in a Location").
 *
 * listRefunds (`Refund`), listTransactions (`Tender`) and listDiscounts
 * (`Discount`) call paths that are NOT in the V4 swagger; its nearest paths
 * are other resources (`RefundReason`, `TenderType`, `DiscountReason`). V4
 * pages every list the same way — each of its list operations carries the two
 * sentences quoted above — so these three page like the documented ones,
 * through the same window, and are held to the same tests. A dead path still
 * throws.
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
import { EposNowAdapter } from '../../../../../../src/verticals/ecommerce/adapters/eposnow/index'

const CREDS = { accessToken: 'epos_test' }
/** Documented: "200 response items per page." — fixed, not requestable. */
const UPSTREAM_PAGE = 200
const N_ROWS = 1000

/**
 * A fake Epos Now V4 that honours ONLY the documented parameter: `page`
 * (int32, optional, page 1 when absent), serving a fixed 200 rows per page.
 * Any other query parameter, or a page below 1, is refused.
 */
function fakeEposNow(path: string, total: number) {
  // `ProductId` + `LocationId` too, so a ProductStock row has its level id.
  const all = Array.from({ length: total }, (_, i) => ({ Id: i + 1, ProductId: i + 1, LocationId: 1 }))
  const get = vi.fn(async (p: string, cfg?: { params?: Record<string, unknown> }) => {
    if (p !== path) throw new Error(`unexpected path ${p} (expected ${path})`)
    const params = cfg?.params ?? {}
    const extra = Object.keys(params).filter((k) => k !== 'page')
    if (extra.length > 0) throw new Error(`undocumented query parameter(s): ${extra.join(', ')}`)
    const raw = params['page']
    const page = raw === undefined ? 1 : raw
    if (typeof page !== 'number' || !Number.isInteger(page) || page < 1) {
      throw new Error(`page must be an integer >= 1 (got ${String(raw)})`)
    }
    const start = (page - 1) * UPSTREAM_PAGE
    return { data: all.slice(start, start + UPSTREAM_PAGE) }
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  } as never)
  return { get }
}

function ids(start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(start + i))
}

type Row = { id: string }

const METHODS = [
  {
    name: 'listProducts',
    path: 'Product',
    call: (a: EposNowAdapter, p: QueryParams): Promise<Row[]> => a.listProducts(CREDS, p),
  },
  {
    name: 'listCollections',
    path: 'Category',
    call: (a: EposNowAdapter, p: QueryParams): Promise<Row[]> => a.listCollections(CREDS, p),
  },
  {
    name: 'listLocations',
    path: 'Location',
    call: (a: EposNowAdapter, p: QueryParams): Promise<Row[]> => a.listLocations(CREDS, p),
  },
  {
    name: 'listCustomers',
    path: 'Customer',
    call: (a: EposNowAdapter, p: QueryParams): Promise<Row[]> => a.listCustomers(CREDS, p),
  },
  {
    name: 'listOrders',
    path: 'Transaction',
    call: (a: EposNowAdapter, p: QueryParams): Promise<Row[]> => a.listOrders(CREDS, p),
  },
  {
    name: 'listInventoryLevels',
    path: 'ProductStock',
    // A level's id is <ProductId>:<LocationId>; the fake numbers ProductId like Id.
    call: async (a: EposNowAdapter, p: QueryParams): Promise<Row[]> =>
      (await a.listInventoryLevels(CREDS, p)).map((l) => ({ id: l.variantId })),
  },
  {
    name: 'listRefunds',
    path: 'Refund',
    call: (a: EposNowAdapter, p: QueryParams): Promise<Row[]> => a.listRefunds(CREDS, p),
  },
  {
    name: 'listTransactions',
    path: 'Tender',
    call: (a: EposNowAdapter, p: QueryParams): Promise<Row[]> => a.listTransactions(CREDS, p),
  },
  {
    name: 'listDiscounts',
    path: 'Discount',
    call: (a: EposNowAdapter, p: QueryParams): Promise<Row[]> => a.listDiscounts(CREDS, p),
  },
] as const

afterEach(() => vi.restoreAllMocks())

describe('eposnow capabilities', () => {
  it('declares the fixed upstream page size (200) so the sync worker never asks for more', () => {
    expect(new EposNowAdapter().capabilities).toEqual(
      expect.objectContaining({ maxPageSize: UPSTREAM_PAGE }),
    )
  })
})

describe.each(METHODS)('eposnow $name paging', ({ path, call }) => {
  const adapter = () => new EposNowAdapter()
  const run = async (query: Record<string, string>) =>
    (await call(adapter(), parseListQuery(query))).map((r) => r.id)
  /** Params at a page the router never sends, as a direct caller builds them. */
  const runAt = async (page: number) => {
    const params = parseListQuery({ limit: '10' })
    params.page = page
    return (await call(adapter(), params)).map((r) => r.id)
  }
  /** The upstream page each request was served (a missing `page` is page 1). */
  const pagesSent = (get: ReturnType<typeof fakeEposNow>['get']) =>
    get.mock.calls.map((c) => c[1]?.params?.['page'] ?? 1)
  /** Page through like SyncWorker, using its termination test verbatim. */
  const syncWalk = async (limit: number): Promise<string[]> => {
    const seen: string[] = []
    for (let k = 1; k <= 10; k++) {
      const params = withPageSink({ page: k, limit })
      const page = (await call(adapter(), params)).map((r) => r.id)
      // The router truncates an over-return to the caller's limit.
      expect(page.length).toBeLessThanOrEqual(limit)
      seen.push(...page)
      // Every page served is cut from the upstream page(s) holding it.
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
      const reported = readUpstreamPage(params)?.hasMore
      if (typeof reported === 'boolean' ? !reported : page.length < limit) break
    }
    return seen
  }

  it('page 1 returns the first rows and asks Epos Now for page=1', async () => {
    const { get } = fakeEposNow(path, N_ROWS)
    expect(await run({ page: '1', limit: '10' })).toEqual(ids(1, 10))
    expect(pagesSent(get)).toEqual([1])
  })

  it('page 2 returns the next rows (still inside upstream page 1)', async () => {
    const { get } = fakeEposNow(path, N_ROWS)
    expect(await run({ page: '2', limit: '10' })).toEqual(ids(11, 10))
    expect(pagesSent(get)).toEqual([1])
  })

  it('a missing page returns the first rows', async () => {
    const { get } = fakeEposNow(path, N_ROWS)
    expect(await run({ limit: '10' })).toEqual(ids(1, 10))
    expect(pagesSent(get)).toEqual([1])
  })

  // parseListQuery reads 0, -3 and non-numbers as the first page before an
  // adapter sees them, so this guard is for direct callers: built directly.
  it.each([0, -3])('a direct page %s is treated as page 1', async (page) => {
    const { get } = fakeEposNow(path, N_ROWS)
    expect(await runAt(page)).toEqual(ids(1, 10))
    expect(pagesSent(get)).toEqual([1])
  })

  it('a limit above the fixed page size (200) is clamped, and page 2 strides by the clamp', async () => {
    const { get } = fakeEposNow(path, N_ROWS)
    expect(await run({ page: '1', limit: '500' })).toEqual(ids(1, 200))
    expect(await run({ page: '2', limit: '500' })).toEqual(ids(201, 200))
    expect(pagesSent(get)).toEqual([1, 2])
  })

  it('a direct limit above 200 reports the 200 it pages by, so listPage walks every row', async () => {
    // parseListQuery with the adapter caps at 200; a direct caller does not.
    // Judged at 500, the first 200-row page read as the last one.
    fakeEposNow(path, N_ROWS)
    const seen: string[] = []
    for (let k = 1; k <= 10; k++) {
      const params = withPageSink({ page: k, limit: 500 })
      const env = listPage(await call(adapter(), params), params, 'eposnow')
      expect(readUpstreamPage(params)).toMatchObject({ pagedLocally: true, pageSize: 200 })
      expect(env.meta.limit).toBe(200)
      seen.push(...env.data.map((r) => r.id))
      if (env.meta.hasMore === false) break
    }
    expect(seen).toEqual(ids(1, N_ROWS))
  })

  it('page 3 of limit 100 starts upstream page 2 and reads only that page', async () => {
    const { get } = fakeEposNow(path, N_ROWS)
    expect(await run({ page: '3', limit: '100' })).toEqual(ids(201, 100))
    expect(pagesSent(get)).toEqual([2])
  })

  it('page 2 of limit 150 spans upstream pages 1 and 2 and returns rows 151..300', async () => {
    const { get } = fakeEposNow(path, N_ROWS)
    expect(await run({ page: '2', limit: '150' })).toEqual(ids(151, 150))
    expect(pagesSent(get)).toEqual([1, 2])
  })

  it('does not ask for the next upstream page when the first one came back short', async () => {
    const { get } = fakeEposNow(path, 160)
    expect(await run({ page: '2', limit: '150' })).toEqual(ids(151, 10))
    expect(pagesSent(get)).toEqual([1])
  })

  it('a direct call with no limit keeps the adapter default of one full upstream page', async () => {
    const { get } = fakeEposNow(path, N_ROWS)
    expect((await call(adapter(), {})).map((r) => r.id)).toEqual(ids(1, 200))
    expect(pagesSent(get)).toEqual([1])
  })

  it.each([
    { name: 'limit 0', params: { limit: 0 }, want: ids(1, 1) },
    { name: 'limit -5 on page 2', params: { limit: -5, page: 2 }, want: ids(2, 1) },
    { name: 'limit NaN', params: { limit: Number.NaN }, want: ids(1, 200) },
  ])(
    'a direct call with $name still reads Epos Now, clamped like parseListQuery',
    async ({ params, want }) => {
      const { get } = fakeEposNow(path, N_ROWS)
      expect((await call(adapter(), params)).map((r) => r.id)).toEqual(want)
      expect(pagesSent(get)).toEqual([1])
    },
  )

  it.each([
    {
      when: 'a queryless call (limit 100) fetched rows past its window',
      query: {},
      n: N_ROWS,
      want: true,
    },
    {
      when: 'a window spanning two upstream pages has rows after it',
      query: { page: '2', limit: '150' },
      n: 301,
      want: true,
    },
    {
      when: 'a short upstream page ends exactly at the window',
      query: { page: '1', limit: '150' },
      n: 150,
      want: false,
    },
    {
      when: 'the second upstream page is short and ends exactly at the window',
      query: { page: '2', limit: '150' },
      n: 300,
      want: false,
    },
    {
      when: 'the window ends exactly on a full upstream page (undecidable)',
      query: { page: '1', limit: '200' },
      n: N_ROWS,
      want: null,
    },
  ])('meta.hasMore is $want when $when', async ({ query, n, want }) => {
    fakeEposNow(path, n)
    const params = parseListQuery(query)
    const rows = await call(adapter(), params)
    expect(listPage(rows, params, 'eposnow').meta.hasMore).toBe(want)
  })

  it.each([
    { limit: 10, n: 21 },
    { limit: 7, n: 15 },
    { limit: 150, n: 301 },
    { limit: 200, n: 401 },
    { limit: 150, n: 300 },
    { limit: 200, n: 400 },
    { limit: 100, n: 200 },
  ])(
    'walks every row exactly once, in order, driven like the sync (limit $limit, N = $n)',
    async ({ limit, n }) => {
      fakeEposNow(path, n)
      expect(await syncWalk(limit)).toEqual(ids(1, n))
    },
  )

  it('reports pagedLocally on a page whose end is undecided, and on a page past the end', async () => {
    fakeEposNow(path, N_ROWS)
    // Ends exactly on a full upstream page: no hasMore, and still local.
    const full = parseListQuery({ page: '1', limit: '200' })
    await call(adapter(), full)
    expect(readUpstreamPage(full)).toEqual({ pagedLocally: true })
    const past = parseListQuery({ page: '200', limit: '10' })
    expect(await call(adapter(), past)).toEqual([])
    expect(readUpstreamPage(past)).toEqual({ pagedLocally: true, hasMore: false })
  })

  it("at the sync's default page size (min(500, maxPageSize) = 200) each upstream page is read once", async () => {
    const { get } = fakeEposNow(path, 401)
    expect(await syncWalk(200)).toEqual(ids(1, 401))
    expect(pagesSent(get)).toEqual([1, 2, 3])
  })
})

describe('eposnow inventory levels are documented ProductStock rows', () => {
  it('lists GET ProductStock, one level per product and location, its quantity the batches summed', async () => {
    const get = vi.fn(async (_path: string) => ({
      data: [
        {
          Id: 88,
          ProductId: 12,
          LocationId: 3,
          ProductStockBatches: [{ CurrentStock: 5 }, { CurrentStock: 7 }],
        },
      ],
    }))
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const [level] = await new EposNowAdapter().listInventoryLevels(CREDS, parseListQuery({ limit: '10' }))
    expect(get.mock.calls.map((c) => c[0])).toEqual(['ProductStock'])
    expect(level).toMatchObject({ id: '12:3', variantId: '12', locationId: '3', available: 12 })
  })

  it('reads a listed level back through the documented product-in-location lookup', async () => {
    const get = vi.fn(async (_path: string) => ({
      data: { Id: 88, ProductId: 12, LocationId: 3, ProductStockBatches: [{ CurrentStock: 4 }] },
    }))
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const level = await new EposNowAdapter().getInventoryLevel(CREDS, '12:3')
    expect(get.mock.calls.map((c) => c[0])).toEqual(['ProductStock/Product/12/Location/3'])
    expect(level).toMatchObject({ id: '12:3', available: 4 })
  })
})
