/**
 * Shift4Shop list paging.
 *
 * Every list endpoint pages by `limit` and `offset`
 * (https://apirest.3dcart.com/v1/products/index.html):
 *   limit:  "Maximum number of items that can be returned"
 *   offset: "Starting point for the return data"
 * and answers 404 when nothing matches ("No orders found.", "No Customer
 * records found.", "No Promotions found."). The body is a bare array with no
 * total or next link. Batch sizes (getting-started, Rate Limits): "This is the
 * maximum number of records that can be retrieved in a single request."
 * "GET Orders: 300", "GET Products: 200", "All Others: 500".
 *
 * Before the fix every list sent `offset = params.offset ?? 0` and never read
 * `page`, so page 2 repeated page 1; and every limit was clamped to 100.
 *
 * Fulfillments have no list endpoint of their own: they are flattened out of
 * each order's `ShipmentList` ("Collection of Shipment objects"), so one page
 * of orders is not one page of fulfillments.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { Shift4ShopAdapter } from '../../../../../../src/verticals/ecommerce/adapters/shift4shop/index'
import type { EcommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapter/interface'

/** The adapter as the router holds it, and hands to parseListQuery. */
const router = (): EcommerceAdapter => new Shift4ShopAdapter()

const CREDS = { accessToken: 'pk_test', extra: { token: 'tok_test' } }

/** Documented batch maximum per endpoint. */
const MAX: Record<string, number> = {
  Products: 200,
  Orders: 300,
  Customers: 500,
  Categories: 500,
  Promotions: 500,
}

type Row = Record<string, unknown>

interface Call {
  path: string
  params: Record<string, unknown>
}

function notFound(): Error {
  return Object.assign(new Error('Request failed with status code 404'), {
    isAxiosError: true,
    response: { status: 404, data: [] },
  })
}

interface FakeOptions {
  /** The store served to a query carrying `keyword=<key>`, instead of the plain one. */
  byKeyword?: Record<string, Record<string, Row[]>>
  /** Answer every request with this HTTP status instead of data. */
  status?: number
}

/**
 * A fake Shift4Shop serving each collection by `limit` and `offset` only. Any
 * other query parameter is refused (bar `keyword` when `byKeyword` serves
 * it), a limit above the endpoint's documented batch size is refused, and an
 * empty result is a 404, as documented.
 *
 * Each connection gets its own store, told apart by the `PrivateKey` header
 * the client is created with; `'*'` serves any key without its own store.
 */
function fakeByPrivateKey(
  byPrivateKey: Record<string, Record<string, Row[]>>,
  opts: FakeOptions = {},
) {
  const calls: Array<Call & { privateKey: string }> = []
  vi.spyOn(axios, 'create').mockImplementation(((cfg?: { headers?: Record<string, unknown> }) => {
    const privateKey = String(cfg?.headers?.['PrivateKey'] ?? '')
    const get = vi.fn(async (path: string, reqCfg?: { params?: Record<string, unknown> }) => {
      const params = { ...(reqCfg?.params ?? {}) }
      calls.push({ path, params, privateKey })
      if (opts.status != null) {
        throw Object.assign(new Error(`Request failed with status code ${opts.status}`), {
          isAxiosError: true,
          response: { status: opts.status, data: {} },
        })
      }
      const keyword = params['keyword'] as string | undefined
      const store =
        keyword != null
          ? opts.byKeyword?.[keyword]
          : (byPrivateKey[privateKey] ?? byPrivateKey['*'])
      if (!store) throw new Error(`no store for key ${privateKey}, keyword ${String(keyword)}`)
      const rows = store[path]
      if (!rows) throw new Error(`unexpected path ${path}`)
      const allowed = opts.byKeyword ? ['limit', 'offset', 'keyword'] : ['limit', 'offset']
      const extra = Object.keys(params).filter((k) => !allowed.includes(k))
      if (extra.length > 0) throw new Error(`undocumented query parameter(s): ${extra.join(', ')}`)
      const limit = Number(params['limit'])
      const offset = Number(params['offset'] ?? 0)
      if (!Number.isInteger(limit) || limit < 1)
        throw new Error(`bad limit ${String(params['limit'])}`)
      if (limit > MAX[path]!)
        throw new Error(`limit ${limit} above the ${path} batch size ${MAX[path]}`)
      if (!Number.isInteger(offset) || offset < 0)
        throw new Error(`bad offset ${String(params['offset'])}`)
      const page = rows.slice(offset, offset + limit)
      if (page.length === 0) throw notFound()
      return { data: page }
    })
    return { get, post: vi.fn(), put: vi.fn(), delete: vi.fn() }
  }) as never)
  return { calls }
}

function fakeShift4Shop(collections: Record<string, Row[]>, opts: FakeOptions = {}) {
  return fakeByPrivateKey({ '*': collections }, opts)
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

const LISTS = [
  {
    method: 'listProducts',
    path: 'Products',
    row: (i: number): Row => ({ CatalogID: i, Name: `Product ${i}` }),
    id: (i: number) => String(i),
  },
  {
    method: 'listInventoryLevels',
    path: 'Products',
    row: (i: number): Row => ({ CatalogID: i, Stock: i }),
    id: (i: number) => `${i}:default:default`,
  },
  {
    method: 'listOrders',
    path: 'Orders',
    row: (i: number): Row => ({ InvoiceNumberPrefix: 'AB-', InvoiceNumber: i }),
    id: (i: number) => `AB-${i}`,
  },
  {
    method: 'listCustomers',
    path: 'Customers',
    row: (i: number): Row => ({ CustomerID: i, Email: `c${i}@example.com` }),
    id: (i: number) => String(i),
  },
  {
    method: 'listCollections',
    path: 'Categories',
    row: (i: number): Row => ({ CategoryID: i, CategoryName: `Cat ${i}` }),
    id: (i: number) => String(i),
  },
  {
    method: 'listDiscounts',
    path: 'Promotions',
    row: (i: number): Row => ({ PromotionID: i, PromotionName: `Promo ${i}` }),
    id: (i: number) => String(i),
  },
] as const

type ListMethod = (typeof LISTS)[number]['method'] | 'listFulfillments'

async function list(
  method: ListMethod,
  params: QueryParams,
  creds: typeof CREDS = CREDS,
): Promise<Array<{ id: string }>> {
  const adapter = new Shift4ShopAdapter() as unknown as Record<
    ListMethod,
    (c: typeof CREDS, p: QueryParams) => Promise<Array<{ id: string }>>
  >
  return adapter[method](creds, params)
}

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

describe.each(LISTS)('shift4shop $method paging', ({ method, path, row, id }) => {
  it.each([2, 5])(
    'N = 2L+1 at limit %i: pages 1..3 serve every row once, hasMore exact',
    async (L) => {
      const n = 2 * L + 1
      fakeShift4Shop({ [path]: range(n).map(row) })
      const seen: string[] = []
      const hasMore: Array<boolean | undefined> = []
      for (let k = 1; k <= 3; k++) {
        const params = withPageSink({ page: k, limit: L })
        const rows = await list(method, params)
        seen.push(...rows.map((r) => r.id))
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(range(n).map(id))
      expect(hasMore).toEqual([true, true, false])
    },
  )

  // No total or next link: a full page is reported as having more, so a list
  // that is an exact multiple of the page size ends on one empty page (the
  // documented 404), never early.
  it('N = 2L: the full last page says hasMore, and the page after it is empty and final', async () => {
    fakeShift4Shop({ [path]: range(4).map(row) })
    const p2 = withPageSink({ page: 2, limit: 2 })
    expect((await list(method, p2)).map((r) => r.id)).toEqual([3, 4].map(id))
    expect(readUpstreamPage(p2)?.hasMore).toBe(true)
    const p3 = withPageSink({ page: 3, limit: 2 })
    expect(await list(method, p3)).toEqual([])
    expect(readUpstreamPage(p3)?.hasMore).toBe(false)
  })

  it('page 2 sends the documented offset and limit', async () => {
    const { calls } = fakeShift4Shop({ [path]: range(11).map(row) })
    await list(method, withPageSink({ page: 2, limit: 5 }))
    expect(calls.map(({ path: p, params }) => ({ path: p, params }))).toEqual([
      { path, params: { limit: 5, offset: 5 } },
    ])
  })

  it('a page past the end (the documented 404) is empty, not an error', async () => {
    fakeShift4Shop({ [path]: range(3).map(row) })
    const params = withPageSink({ page: 4, limit: 5 })
    expect(await list(method, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('a limit above the batch size is clamped, reported, and still serves every row', async () => {
    const max = MAX[path]!
    const n = 2 * max + 3
    const { calls } = fakeShift4Shop({ [path]: range(n).map(row) })
    const seen: string[] = []
    for (let k = 1; k <= 4; k++) {
      const params = withPageSink({ page: k, limit: 500 })
      const rows = await list(method, params)
      seen.push(...rows.map((r) => r.id))
      if (max < 500) expect(readUpstreamPage(params)?.pageSize).toBe(max)
    }
    expect(seen).toEqual(range(n).map(id))
    for (const c of calls) expect(Number(c.params['limit'])).toBeLessThanOrEqual(max)
  })

  it('through the API path, page 1 of 2L+1 says hasMore true and page 3 says false', async () => {
    fakeShift4Shop({ [path]: range(7).map(row) })
    const adapter = router()
    const p1 = parseListQuery({ page: '1', limit: '3' }, adapter)
    const env1 = listPage(await list(method, p1), p1, 'shift4shop')
    expect(env1.data.map((r) => r.id)).toEqual([1, 2, 3].map(id))
    expect(env1.meta.hasMore).toBe(true)
    const p3 = parseListQuery({ page: '3', limit: '3' }, adapter)
    const env3 = listPage(await list(method, p3), p3, 'shift4shop')
    expect(env3.data.map((r) => r.id)).toEqual([7].map(id))
    expect(env3.meta.hasMore).toBe(false)
  })

  // Only the documented 404 is an empty page. Bad keys must not read as an
  // empty store, or a sync would record the collection as complete.
  it.each([401, 403])('a %i is an error, not an empty page', async (status) => {
    fakeShift4Shop({ [path]: range(3).map(row) }, { status })
    await expect(list(method, withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(String(status))
  })

  it('with no limit, sends the default page size of 100', async () => {
    const { calls } = fakeShift4Shop({ [path]: range(3).map(row) })
    await list(method, withPageSink({ page: 1 }))
    expect(calls).toEqual([expect.objectContaining({ path, params: { limit: 100, offset: 0 } })])
  })

  it('a direct limit of 600 is clamped to the batch size', async () => {
    const max = MAX[path]!
    const { calls } = fakeShift4Shop({ [path]: range(max + 1).map(row) })
    const params = withPageSink({ page: 1, limit: 600 })
    expect(await list(method, params)).toHaveLength(max)
    expect(calls.map((c) => c.params)).toEqual([{ limit: max, offset: 0 }])
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: max })
  })

  it('the search is sent as keyword, and the filtered rows are served', async () => {
    const { calls } = fakeShift4Shop(
      { [path]: range(5).map(row) },
      { byKeyword: { blue: { [path]: [4, 5].map(row) } } },
    )
    const rows = await list(method, withPageSink({ page: 1, limit: 5, search: 'blue' }))
    expect(rows.map((r) => r.id)).toEqual([4, 5].map(id))
    expect(calls.map((c) => c.params)).toEqual([{ limit: 5, offset: 0, keyword: 'blue' }])
  })
})

/**
 * Orders where fulfillments are sparse and uneven: most orders carry none,
 * some carry two, and they are spread across three 300-order upstream pages.
 */
function ordersWithShipments(
  total: number,
  shipped: Record<number, number>,
  prefix = 'AB-',
): Row[] {
  let next = 1
  return range(total).map((i) => ({
    InvoiceNumberPrefix: prefix,
    InvoiceNumber: i,
    ShipmentList: Array.from({ length: shipped[i] ?? 0 }, () => ({ ShipmentID: next++ })),
  }))
}

/** Fulfillment ids in stream order for {@link ordersWithShipments}. */
function fulfillmentIds(orders: Row[]): string[] {
  return orders.flatMap((o) =>
    (o['ShipmentList'] as Array<{ ShipmentID: number }>).map(
      (s) => `${String(o['InvoiceNumberPrefix'])}${String(o['InvoiceNumber'])}:${s.ShipmentID}`,
    ),
  )
}

describe('shift4shop listFulfillments paging (rows flattened out of orders)', () => {
  // 11 = 2·5 + 1 fulfillments across orders 1..700 (upstream pages 1-300, 301-600, 601-700).
  const SHIPPED = { 2: 2, 5: 1, 299: 1, 300: 2, 301: 1, 450: 1, 600: 1, 601: 1, 700: 1 }

  it('N = 2L+1 at limit 5: pages 1..3 serve every fulfillment once, hasMore exact', async () => {
    const orders = ordersWithShipments(700, SHIPPED)
    const { calls } = fakeShift4Shop({ Orders: orders })
    const seen: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: 5 })
      const rows = await list('listFulfillments', params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(fulfillmentIds(orders))
    expect(seen).toHaveLength(11)
    expect(hasMore).toEqual([true, true, false])
    // Every order page is fetched once, at the documented batch size.
    expect(calls.map((c) => c.params)).toEqual([
      { limit: 300, offset: 0 },
      { limit: 300, offset: 300 },
      { limit: 300, offset: 600 },
    ])
  })

  it('page 2 alone reaches past the first page of orders by the documented offset', async () => {
    const orders = ordersWithShipments(700, SHIPPED)
    const { calls } = fakeShift4Shop({ Orders: orders })
    const rows = await list('listFulfillments', withPageSink({ page: 2, limit: 5 }))
    expect(rows.map((r) => r.id)).toEqual(fulfillmentIds(orders).slice(5, 10))
    expect(calls.map((c) => c.params['offset'])).toContain(300)
  })

  it('a limit above every batch size still serves every fulfillment', async () => {
    const orders = ordersWithShipments(700, SHIPPED)
    fakeShift4Shop({ Orders: orders })
    const params = withPageSink({ page: 1, limit: 1000 })
    const rows = await list('listFulfillments', params)
    expect(rows.map((r) => r.id)).toEqual(fulfillmentIds(orders))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('through the API path, page 2 of 11 at limit 5 says hasMore true', async () => {
    fakeShift4Shop({ Orders: ordersWithShipments(700, SHIPPED) })
    const params = parseListQuery({ page: '2', limit: '5' }, router())
    const env = listPage(await list('listFulfillments', params), params, 'shift4shop')
    expect(env.data).toHaveLength(5)
    expect(env.meta.hasMore).toBe(true)
  })

  // 600 orders is two full upstream pages, so the walk's last request is past
  // the end and gets the documented 404, which must end the list.
  it('an exact multiple of 300 orders ends on the documented 404, not an error', async () => {
    const orders = ordersWithShipments(600, { 1: 1, 300: 2, 301: 1, 600: 1 })
    const { calls } = fakeShift4Shop({ Orders: orders })
    const params = withPageSink({ page: 1, limit: 100 })
    const rows = await list('listFulfillments', params)
    expect(rows.map((r) => r.id)).toEqual(fulfillmentIds(orders))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(calls.map((c) => c.params['offset'])).toEqual([0, 300, 600])
  })

  it('a 401 is an error, not an empty list', async () => {
    fakeShift4Shop({ Orders: ordersWithShipments(10, { 1: 1 }) }, { status: 401 })
    await expect(list('listFulfillments', withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(
      '401',
    )
  })

  // pageByRows keeps the walk between pages, so its key must tell connections
  // and searches apart: page 2 of one must never continue the walk of another.
  it('page 2 under another connection walks that connection’s orders', async () => {
    const a = ordersWithShipments(10, { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }, 'A-')
    const b = ordersWithShipments(10, { 6: 1, 7: 1, 8: 1, 9: 1, 10: 1 }, 'B-')
    fakeByPrivateKey({ pk_a: { Orders: a }, pk_b: { Orders: b } })
    const credsA = { accessToken: 'pk_a', extra: { token: 'tok' } }
    const credsB = { accessToken: 'pk_b', extra: { token: 'tok' } }
    const p1 = await list('listFulfillments', withPageSink({ page: 1, limit: 2 }), credsA)
    expect(p1.map((r) => r.id)).toEqual(fulfillmentIds(a).slice(0, 2))
    const p2 = await list('listFulfillments', withPageSink({ page: 2, limit: 2 }), credsB)
    expect(p2.map((r) => r.id)).toEqual(fulfillmentIds(b).slice(2, 4))
  })

  it('page 2 without the search walks the unfiltered orders, and sends no keyword', async () => {
    const all = ordersWithShipments(10, { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }, 'ALL-')
    const blue = ordersWithShipments(10, { 6: 1, 7: 1, 8: 1, 9: 1, 10: 1 }, 'BLUE-')
    const { calls } = fakeShift4Shop({ Orders: all }, { byKeyword: { blue: { Orders: blue } } })
    const p1 = await list('listFulfillments', withPageSink({ page: 1, limit: 2, search: 'blue' }))
    expect(p1.map((r) => r.id)).toEqual(fulfillmentIds(blue).slice(0, 2))
    expect(calls[0]!.params).toEqual({ limit: 300, offset: 0, keyword: 'blue' })
    const p2 = await list('listFulfillments', withPageSink({ page: 2, limit: 2 }))
    expect(p2.map((r) => r.id)).toEqual(fulfillmentIds(all).slice(2, 4))
  })
})

describe('shift4shop listFulfillments for one order', () => {
  // Orders/{id} returns the order with its whole ShipmentList, so the caller's
  // page is cut from that list locally.
  function fakeOrder(order: Row) {
    const calls: string[] = []
    vi.spyOn(axios, 'create').mockReturnValue({
      get: vi.fn(async (path: string) => {
        calls.push(path)
        if (path !== `Orders/${String(order['OrderID'])}`) throw notFound()
        return { data: [order] }
      }),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    } as never)
    return { calls }
  }

  const ORDER = {
    OrderID: 42,
    ShipmentList: range(5).map((i) => ({ ShipmentID: i })),
  }

  it('pages the order’s shipments locally, hasMore exact', async () => {
    const { calls } = fakeOrder(ORDER)
    const seen: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: 2, orderId: 42 } as QueryParams)
      seen.push(...(await list('listFulfillments', params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(range(5).map((i) => `42:${i}`))
    expect(hasMore).toEqual([true, true, false])
    expect(calls).toEqual(['Orders/42', 'Orders/42', 'Orders/42'])
  })
})
