/**
 * Clover list paging: 1-based `page` + caller's `limit` → Clover's 0-based row
 * `offset` + `limit` query parameters.
 *
 * Clover Platform API reference (OpenAPI served as markdown), on
 * GET /v3/merchants/{mId}/items, /categories and /discounts:
 * https://docs.clover.com/dev/reference/inventorygetitems.md
 * https://docs.clover.com/dev/reference/categorygetcategories.md
 * https://docs.clover.com/dev/reference/inventorygetdiscounts.md
 *   offset: "Position of the first line item returned in the search results.
 *            Indicates the number of line items that are excluded from the
 *            search results."
 *   limit:  "Maximum number of line items returned in the search result.
 *            Default: 100  Maximum limit: 1000"
 *
 * The reference pages for /customers, /item_stocks, /orders and /payments list
 * no paging parameters. The REST guide covers every REST list:
 * https://docs.clover.com/dev/docs/paginating-elements.md
 *   "add query parameters, such as `offset` and `limit`, to your request. These
 *    parameters can be used to page through large result sets. The default
 *    limit is 100 elements, and the hard limit is 1000."
 *
 * Clover's FAQs say the same for two of those four, per endpoint:
 * https://docs.clover.com/dev/docs/orders-faqs.md
 *   "Clover Orders API enforces a limit of 1000 records per request." with the
 *   example first page `.../orders?filter=...&limit=100&offset=0`
 * https://docs.clover.com/dev/docs/inventory-faqs.md (on /items)
 *   "you must use the offset and limit query parameters to page through the
 *    full list, such as `?limit=100&offset=100`."   (page 2 = offset 100)
 *
 * So `offset` is a row count to skip (page 1 is offset 0), and a limit above
 * 1000 is clamped — which the adapter declares as `maxPageSize` so the sync
 * worker's short-page test agrees with the size actually sent.
 *
 * Base URL: https://docs.clover.com/dev/docs/making-rest-api-calls.md gives
 * the sandbox REST API as `https://apisandbox.dev.clover.com`, and lists
 * `https://sandbox.dev.clover.com/` only as the "[Legacy] Developer
 * Dashboard"; North America production is `https://api.clover.com`.
 *
 * Not covered here: listRefunds, whose `orders/{orderId}/refunds` path is not
 * in Clover's Platform API reference (only `/v3/merchants/{mId}/refunds` is),
 * so its paging is left as it was; and listLocations, which reads the single
 * merchant record, takes no paging and is paged locally (paging.test.ts).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { parseListQuery, withPageSink, type QueryParams } from '@opensteward/shared'
import { CloverAdapter } from '../../../../../../src/verticals/ecommerce/adapters/clover/index'

const MERCHANT = 'MERCHANT1'
const CREDS = { accessToken: 'clv_test', extra: { merchantId: MERCHANT, environment: 'sandbox' } }
/** Documented: "The default limit is 100 elements, and the hard limit is 1000." */
const DEFAULT_LIMIT = 100
const HARD_LIMIT = 1000
const N_ROWS = 2500

/**
 * A fake Clover that honours ONLY the documented paging parameters: `offset`
 * (rows excluded from the results, default 0) and `limit` (default 100, hard
 * limit 1000). Any other query parameter, or a limit above the hard limit, is
 * refused.
 */
function fakeClover(path: string, total: number) {
  const all = Array.from({ length: total }, (_, i) => ({
    id: String(i + 1),
    item: { id: String(i + 1) },
  }))
  const get = vi.fn(async (p: string, cfg?: { params?: Record<string, unknown> }) => {
    if (p !== path) throw new Error(`unexpected path ${p} (expected ${path})`)
    const params = cfg?.params ?? {}
    const extra = Object.keys(params).filter((k) => k !== 'offset' && k !== 'limit')
    if (extra.length > 0) throw new Error(`undocumented query parameter(s): ${extra.join(', ')}`)
    const offset = params['offset'] ?? 0
    const limit = params['limit'] ?? DEFAULT_LIMIT
    if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
      throw new Error(`offset must be an integer >= 0 (got ${String(offset)})`)
    }
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > HARD_LIMIT) {
      throw new Error(`limit must be an integer in [1, ${HARD_LIMIT}] (got ${String(limit)})`)
    }
    return { data: { elements: all.slice(offset, offset + limit) } }
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post: vi.fn(),
    delete: vi.fn(),
  } as never)
  return { get }
}

function ids(start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(start + i))
}

type Call = (a: CloverAdapter, p: QueryParams) => Promise<string[]>

const byId =
  <T extends { id: string }>(fn: (a: CloverAdapter, p: QueryParams) => Promise<T[]>): Call =>
  async (a, p) =>
    (await fn(a, p)).map((r) => r.id)

const METHODS: ReadonlyArray<{ name: string; path: string; call: Call }> = [
  { name: 'listProducts', path: 'items', call: byId((a, p) => a.listProducts(CREDS, p)) },
  {
    name: 'listCollections',
    path: 'categories',
    call: byId((a, p) => a.listCollections(CREDS, p)),
  },
  {
    name: 'listInventoryLevels',
    path: 'item_stocks',
    // The canonical id is `{itemId}:{merchantId}`; compare on the item id.
    call: async (a, p) => (await a.listInventoryLevels(CREDS, p)).map((r) => r.variantId),
  },
  { name: 'listCustomers', path: 'customers', call: byId((a, p) => a.listCustomers(CREDS, p)) },
  { name: 'listOrders', path: 'orders', call: byId((a, p) => a.listOrders(CREDS, p)) },
  {
    name: 'listTransactions',
    path: 'payments',
    call: byId((a, p) => a.listTransactions(CREDS, p)),
  },
  { name: 'listDiscounts', path: 'discounts', call: byId((a, p) => a.listDiscounts(CREDS, p)) },
]

afterEach(() => vi.restoreAllMocks())

describe('clover capabilities', () => {
  it('declares the documented hard limit (1000) so the sync worker never asks for more', () => {
    expect(new CloverAdapter().capabilities).toEqual(
      expect.objectContaining({ maxPageSize: HARD_LIMIT }),
    )
  })
})

describe('clover REST base URL', () => {
  it.each([
    ['sandbox', 'https://apisandbox.dev.clover.com'],
    ['production', 'https://api.clover.com'],
  ])('%s credentials call %s', async (environment, host) => {
    fakeClover('items', 1)
    await new CloverAdapter().listProducts(
      { ...CREDS, extra: { ...CREDS.extra, environment } },
      parseListQuery({}),
    )
    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: `${host}/v3/merchants/${MERCHANT}/` }),
    )
  })
})

describe.each(METHODS)('clover $name paging', ({ path, call }) => {
  const adapter = () => new CloverAdapter()
  const run = (query: Record<string, string>) => call(adapter(), parseListQuery(query))
  /** Params at a page the router never sends, as a direct caller builds them. */
  const runAt = async (page: number) => {
    const params = parseListQuery({ limit: '10' })
    params.page = page
    return call(adapter(), params)
  }
  const sent = (get: ReturnType<typeof fakeClover>['get']) =>
    get.mock.calls.map((c) => c[1]?.params)

  it('page 1 returns the first rows and asks Clover for offset=0', async () => {
    const { get } = fakeClover(path, N_ROWS)
    expect(await run({ page: '1', limit: '10' })).toEqual(ids(1, 10))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith(path, { params: { offset: 0, limit: 10 } })
  })

  it('page 2 returns the next rows (offset=10)', async () => {
    const { get } = fakeClover(path, N_ROWS)
    expect(await run({ page: '2', limit: '10' })).toEqual(ids(11, 10))
    expect(sent(get)).toEqual([{ offset: 10, limit: 10 }])
  })

  it('a missing page returns the first rows', async () => {
    const { get } = fakeClover(path, N_ROWS)
    expect(await run({ limit: '10' })).toEqual(ids(1, 10))
    expect(sent(get)).toEqual([{ offset: 0, limit: 10 }])
  })

  // parseListQuery reads 0, -3 and non-numbers as the first page before an
  // adapter sees them, so this guard is for direct callers: built directly.
  it.each([0, -3, Number.NaN])('a direct page %s is treated as page 1', async (page) => {
    const { get } = fakeClover(path, N_ROWS)
    expect(await runAt(page)).toEqual(ids(1, 10))
    expect(sent(get)).toEqual([{ offset: 0, limit: 10 }])
  })

  it('a limit above the hard limit (1000) is clamped, and page 2 strides by the clamp', async () => {
    const { get } = fakeClover(path, N_ROWS)
    expect(await call(adapter(), { page: 1, limit: 2000 })).toEqual(ids(1, HARD_LIMIT))
    expect(await call(adapter(), { page: 2, limit: 2000 })).toEqual(ids(1001, HARD_LIMIT))
    expect(sent(get)).toEqual([
      { offset: 0, limit: HARD_LIMIT },
      { offset: HARD_LIMIT, limit: HARD_LIMIT },
    ])
  })

  it('a direct call with no page or limit keeps the default of 100 from the first row', async () => {
    const { get } = fakeClover(path, N_ROWS)
    expect(await call(adapter(), {})).toEqual(ids(1, DEFAULT_LIMIT))
    expect(sent(get)).toEqual([{ offset: 0, limit: DEFAULT_LIMIT }])
  })

  it('a direct call for page 2 with no limit strides by the default of 100', async () => {
    const { get } = fakeClover(path, N_ROWS)
    expect(await call(adapter(), { page: 2 })).toEqual(ids(101, DEFAULT_LIMIT))
    expect(sent(get)).toEqual([{ offset: DEFAULT_LIMIT, limit: DEFAULT_LIMIT }])
  })

  it.each([10, 7, 500])(
    'walks every row exactly once, in order, driven like the sync (limit %i, N = 2L + 1)',
    async (limit) => {
      const n = 2 * limit + 1
      fakeClover(path, n)
      const seen: string[] = []
      for (let k = 1; k <= 10; k++) {
        const page = await call(adapter(), withPageSink({ page: k, limit }))
        // The router truncates an over-return to the caller's limit.
        expect(page.length).toBeLessThanOrEqual(limit)
        seen.push(...page)
        if (page.length < limit) break
      }
      expect(seen).toEqual(ids(1, n))
    },
  )
})
