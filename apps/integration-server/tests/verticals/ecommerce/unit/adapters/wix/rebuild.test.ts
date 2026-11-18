/**
 * Wix methods rebuilt onto documented endpoints.
 *
 * listOrders → Search Orders
 *   (business-solutions/e-commerce/orders/orders/search-orders.md):
 *   "URL: https://www.wixapis.com/ecom/v1/orders/search", body
 *   `search.cursorPaging` { limit: "minimum 0, maximum 100", cursor: "Pointer to
 *   the next or previous page in the list of results." }, response `orders` +
 *   `metadata` { cursors.next, hasNext: "Whether there are more pages to
 *   retrieve following the current page." }. The old `/ecom/v1/orders/query`
 *   is not a documented path.
 * listDiscounts → Query Coupons (business-solutions/coupons/coupons/query-coupons.md):
 *   "URL: https://www.wixapis.com/stores/v2/coupons/query", "A maximum of 100
 *   coupons will be returned per request.", `query.paging` { limit, offset:
 *   "Offset since the beginning of the collection." }, response `totalResults`.
 *   getDiscount → Get A Coupon: "URL: https://www.wixapis.com/stores/v2/coupons/{id}".
 * listLocations → Query Locations (business-management/locations/query-locations.md):
 *   "URL: https://www.wixapis.com/locations/v1/locations/query", `query.paging`
 *   { limit, offset }, response `pagingMetadata.hasNext`. Replaces a synthetic
 *   'default' location returned without any request.
 * listRefunds / listTransactions → List Transactions For Single Order
 *   (business-solutions/e-commerce/orders/order-transactions/list-transactions-for-single-order.md):
 *   "URL: https://www.wixapis.com/ecom/v1/payments/orders/{orderId}", the whole
 *   payments/refunds record in one response; the order's currency from Get
 *   Order ("URL: https://www.wixapis.com/ecom/v1/orders/{id}"). Without an
 *   order_id they walk Search Orders pages and, per page, List Transactions
 *   For Multiple Orders ("URL: https://www.wixapis.com/ecom/v1/payments/list-by-ids",
 *   `orderIds` "minItems 1, maxItems 100").
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  effectivePageSize,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import type { EcommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapter/interface'
import { WixAdapter } from '../../../../../../src/verticals/ecommerce/adapters/wix/index'
import { OrderSchema } from '../../../../../../src/verticals/ecommerce/schema/order'
import { DiscountSchema } from '../../../../../../src/verticals/ecommerce/schema/discount'
import { LocationSchema } from '../../../../../../src/verticals/ecommerce/schema/location'
import { RefundSchema } from '../../../../../../src/verticals/ecommerce/schema/refund'
import { TransactionSchema } from '../../../../../../src/verticals/ecommerce/schema/transaction'

const CREDS = { accessToken: 'wix_test', refreshToken: 'wix_refresh' }
const ORDERS_MAX = 100
const COUPONS_MAX = 100
const ADAPTER_MAX = 100

function badRequest(msg: string): Error {
  return Object.assign(new Error(msg), { status: 400 })
}
function notFound(path: string): Error {
  return Object.assign(new Error(`unexpected ${path}`), { status: 404 })
}
function onlyKeys(obj: Record<string, unknown>, allowed: string[], what: string): void {
  const extra = Object.keys(obj).filter((k) => !allowed.includes(k))
  if (extra.length > 0) throw badRequest(`unknown ${what} keys: ${extra.join(',')}`)
}

function order(i: number) {
  return {
    id: `o${i}`,
    number: String(10000 + i),
    createdDate: '2026-01-15T09:30:00.000Z',
    currency: 'USD',
    lineItems: [
      {
        id: `li${i}`,
        productName: { original: `Item ${i}` },
        quantity: 1,
        price: { amount: '10.00', formattedAmount: '$10.00' },
      },
    ],
    priceSummary: { total: { amount: '10.00', formattedAmount: '$10.00' } },
    paymentStatus: 'PAID',
  }
}
function coupon(i: number) {
  return {
    id: `c${i}`,
    specification: {
      name: `C${i}`,
      code: `CODE${i}`,
      percentOffRate: 10,
      scope: { namespace: 'stores' },
    },
    dateCreated: '1719390501000',
    numberOfUsages: 0,
  }
}
function location(i: number) {
  return { id: `l${i}`, name: `Location ${i}`, status: 'ACTIVE', archived: false }
}

interface Sent {
  method: 'GET' | 'POST'
  path: string
  body?: unknown
}

/**
 * A fake Wix honouring ONLY the documented request shapes: any other path,
 * body key or out-of-range limit is refused, and Search Orders accepts only
 * cursors it minted itself.
 */
function fakeWix(opts: {
  orders?: number
  coupons?: number
  locations?: number
  payments?: number
  refunds?: number
  orderCurrency?: string
  perOrder?: (orderId: string) => number
}) {
  const sent: Sent[] = []
  const orders = Array.from({ length: opts.orders ?? 0 }, (_, i) => {
    const o = order(i + 1) as Record<string, unknown>
    if ('orderCurrency' in opts) o['currency'] = opts.orderCurrency
    return o
  })
  const coupons = Array.from({ length: opts.coupons ?? 0 }, (_, i) => coupon(i + 1))
  const locations = Array.from({ length: opts.locations ?? 0 }, (_, i) => location(i + 1))
  const cursors = new Map<string, number>()

  const post = vi.fn(async (path: string, body: unknown) => {
    sent.push({ method: 'POST', path, body })
    const b = (body ?? {}) as Record<string, unknown>
    if (path === '/ecom/v1/orders/search') {
      onlyKeys(b, ['search'], 'body')
      const search = (b['search'] ?? {}) as Record<string, unknown>
      onlyKeys(search, ['cursorPaging'], 'search')
      const cp = (search['cursorPaging'] ?? {}) as Record<string, unknown>
      onlyKeys(cp, ['limit', 'cursor'], 'cursorPaging')
      const limit = cp['limit'] ?? 100
      if (typeof limit !== 'number' || limit < 0 || limit > ORDERS_MAX) {
        throw badRequest(`limit out of range: ${String(limit)}`)
      }
      let start = 0
      if (cp['cursor'] !== undefined) {
        const at = cursors.get(String(cp['cursor']))
        if (at === undefined) throw badRequest('unknown cursor')
        start = at
      }
      const page = orders.slice(start, start + limit)
      const end = start + page.length
      const hasNext = end < orders.length
      const cursors_: Record<string, string> = {}
      if (hasNext) {
        const token = `cur-${end}-${Math.random().toString(36).slice(2)}`
        cursors.set(token, end)
        cursors_.next = token
      }
      return {
        data: { orders: page, metadata: { count: page.length, cursors: cursors_, hasNext } },
      }
    }
    if (path === '/stores/v2/coupons/query' || path === '/locations/v1/locations/query') {
      onlyKeys(b, ['query'], 'body')
      const query = (b['query'] ?? {}) as Record<string, unknown>
      onlyKeys(query, ['paging'], 'query')
      const paging = (query['paging'] ?? {}) as Record<string, unknown>
      onlyKeys(paging, ['limit', 'offset'], 'paging')
      const limit = paging['limit'] as number
      const offset = (paging['offset'] ?? 0) as number
      if (typeof limit !== 'number' || limit < 0) throw badRequest('bad limit')
      if (path === '/stores/v2/coupons/query') {
        if (limit > COUPONS_MAX) throw badRequest('limit above 100')
        const page = coupons.slice(offset, offset + limit)
        return { data: { coupons: page, totalResults: coupons.length } }
      }
      const page = locations.slice(offset, offset + limit)
      return {
        data: {
          locations: page,
          pagingMetadata: {
            count: page.length,
            offset,
            hasNext: offset + page.length < locations.length,
          },
        },
      }
    }
    if (path === '/ecom/v1/payments/list-by-ids') {
      onlyKeys(b, ['orderIds'], 'body')
      const ids = b['orderIds']
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100) {
        throw badRequest('orderIds must hold 1 to 100 ids')
      }
      return {
        data: { orderTransactions: ids.map((id) => orderTransactions(String(id))) },
      }
    }
    throw notFound(path)
  })

  /**
   * An order's transactions record. `perOrder` (when given) sets how many
   * payments and refunds each order has, so a cross-order walk sees uneven
   * rows per upstream page; otherwise every order has opts.payments/refunds.
   */
  function orderTransactions(orderId: string) {
    const n = opts.perOrder?.(orderId)
    return {
      orderId,
      payments: Array.from({ length: n ?? opts.payments ?? 0 }, (_, i) => ({
        id: `p${i + 1}`,
        createdDate: '2026-07-26T13:11:45.312Z',
        amount: { amount: '25.00', formattedAmount: '$25.00' },
        status: 'APPROVED',
      })),
      refunds: Array.from({ length: n ?? opts.refunds ?? 0 }, (_, i) => ({
        id: `r${i + 1}`,
        transactions: [{ paymentId: 'p1', amount: { amount: '5.00' }, refundStatus: 'SUCCEEDED' }],
        details: { reason: 'r', lineItems: [{ lineItemId: 'li1', quantity: 1 }] },
        createdDate: '2026-07-27T09:00:00.000Z',
        summary: { requestedRefund: { amount: '5.00', formattedAmount: '$5.00' } },
      })),
    }
  }

  const get = vi.fn(async (path: string) => {
    sent.push({ method: 'GET', path })
    let m = /^\/ecom\/v1\/payments\/orders\/([^/]+)$/.exec(path)
    if (m) {
      return { data: { orderTransactions: orderTransactions(decodeURIComponent(m[1]!)) } }
    }
    m = /^\/ecom\/v1\/orders\/([^/]+)$/.exec(path)
    if (m) {
      const o = { ...order(1), id: decodeURIComponent(m[1]!) } as Record<string, unknown>
      if ('orderCurrency' in opts) o['currency'] = opts.orderCurrency
      return { data: { order: o } }
    }
    m = /^\/stores\/v2\/coupons\/([^/]+)$/.exec(path)
    if (m) return { data: { coupon: { ...coupon(1), id: decodeURIComponent(m[1]!) } } }
    m = /^\/locations\/v1\/locations\/([^/]+)$/.exec(path)
    if (m) return { data: { location: { ...location(1), id: decodeURIComponent(m[1]!) } } }
    throw notFound(path)
  })

  vi.spyOn(axios, 'create').mockReturnValue({ post, get } as unknown as ReturnType<
    typeof axios.create
  >)
  return { sent, post, get }
}

const adapter = () =>
  new WixAdapter({ clientId: 'id', clientSecret: 'secret', redirectUri: 'https://x.test/cb' })

type ListMethod = 'listOrders' | 'listDiscounts' | 'listLocations'

async function callIds(method: ListMethod, params: QueryParams): Promise<string[]> {
  const rows = (await adapter()[method](CREDS, params)) as { id: string }[]
  return rows.map((r) => r.id)
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

const LISTS: { method: ListMethod; prefix: string; key: 'orders' | 'coupons' | 'locations' }[] = [
  { method: 'listOrders', prefix: 'o', key: 'orders' },
  { method: 'listDiscounts', prefix: 'c', key: 'coupons' },
  { method: 'listLocations', prefix: 'l', key: 'locations' },
]

describe.each(LISTS)('wix $method paging walk', ({ method, prefix, key }) => {
  const want = (n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)

  it.each([10, 7])(
    'N = 2L + 1 rows driven like the sync (limit %i) serve every id once with exact hasMore',
    async (limit) => {
      const n = 2 * limit + 1
      fakeWix({ [key]: n })
      const seen: string[] = []
      const hasMore: (boolean | undefined)[] = []
      for (const k of [1, 2, 3]) {
        const params = withPageSink({ page: k, limit })
        seen.push(...(await callIds(method, params)))
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(want(n))
      expect(hasMore).toEqual([true, true, false])
    },
  )

  it('a limit above the maximum is clamped, reported, and still serves every row', async () => {
    const n = 2 * ADAPTER_MAX + 1
    fakeWix({ [key]: n })
    const seen: string[] = []
    for (let k = 1; k <= 10; k++) {
      const params = withPageSink({ page: k, limit: 150 })
      seen.push(...(await callIds(method, params)))
      expect(effectivePageSize(params, 150)).toBe(ADAPTER_MAX)
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(seen).toEqual(want(n))
  })

  it('the API path (parseListQuery then listPage) reports meta.hasMore', async () => {
    fakeWix({ [key]: 25 })
    const a = adapter()
    const p2 = parseListQuery({ page: '2', limit: '10' }, a as EcommerceAdapter)
    const env2 = listPage((await a[method](CREDS, p2)) as { id: string }[], p2, 'wix')
    expect(env2.data.map((r) => r.id)).toEqual(want(20).slice(10))
    expect(env2.meta.hasMore).toBe(true)
    const p3 = parseListQuery({ page: '3', limit: '10' }, a as EcommerceAdapter)
    const env3 = listPage((await a[method](CREDS, p3)) as { id: string }[], p3, 'wix')
    expect(env3.data.map((r) => r.id)).toEqual(want(25).slice(20))
    expect(env3.meta.hasMore).toBe(false)
  })
})

describe('wix listOrders (Search Orders)', () => {
  it('posts only search.cursorPaging to /ecom/v1/orders/search, never the old /query path', async () => {
    const { sent } = fakeWix({ orders: 25 })
    await adapter().listOrders(CREDS, withPageSink({ page: 1, limit: 10 }))
    await adapter().listOrders(CREDS, withPageSink({ page: 2, limit: 10 }))
    expect(sent.map((s) => s.path)).toEqual(['/ecom/v1/orders/search', '/ecom/v1/orders/search'])
    expect(sent[0]!.body).toEqual({ search: { cursorPaging: { limit: 10 } } })
    const second = sent[1]!.body as { search: { cursorPaging: { limit: number; cursor?: string } } }
    expect(second.search.cursorPaging.limit).toBe(10)
    expect(typeof second.search.cursorPaging.cursor).toBe('string')
  })

  it('a fresh walk to page 3 follows the documented cursors from page 1', async () => {
    const { sent } = fakeWix({ orders: 30 })
    const got = await callIds('listOrders', withPageSink({ page: 3, limit: 10 }))
    expect(got).toEqual(Array.from({ length: 10 }, (_, i) => `o${21 + i}`))
    expect(sent).toHaveLength(3)
  })

  it('every order parses with OrderSchema, money in the order currency', async () => {
    fakeWix({ orders: 3 })
    const rows = await adapter().listOrders(CREDS, withPageSink({ page: 1, limit: 10 }))
    for (const r of rows) OrderSchema.parse(r)
    expect(rows[0]!.totalPrice).toEqual({ amount: 1000, currency: 'USD' })
  })

  it('reads an order back by the documented GET /ecom/v1/orders/{id}', async () => {
    const { sent } = fakeWix({})
    const o = await adapter().getOrder(CREDS, 'o7')
    expect(o.id).toBe('o7')
    expect(sent).toEqual([{ method: 'GET', path: '/ecom/v1/orders/o7' }])
  })

  it('URL-encodes the id it reads an order back by', async () => {
    const { sent } = fakeWix({})
    await adapter().getOrder(CREDS, 'a/b')
    expect(sent).toEqual([{ method: 'GET', path: '/ecom/v1/orders/a%2Fb' }])
  })
})

describe('wix listDiscounts (Query Coupons v2)', () => {
  it('posts query.paging with the offset to /stores/v2/coupons/query and reports totalResults', async () => {
    const { sent } = fakeWix({ coupons: 50 })
    const params = withPageSink({ page: 2, limit: 10 })
    const rows = await adapter().listDiscounts(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 10 }, (_, i) => `c${11 + i}`))
    expect(sent).toEqual([
      {
        method: 'POST',
        path: '/stores/v2/coupons/query',
        body: { query: { paging: { limit: 10, offset: 10 } } },
      },
    ])
    expect(readUpstreamPage(params)?.totalCount).toBe(50)
    for (const r of rows) DiscountSchema.parse(r)
  })

  it('reads a coupon back by the documented GET /stores/v2/coupons/{id}', async () => {
    const { sent } = fakeWix({})
    const d = await adapter().getDiscount(CREDS, 'c9')
    expect(d.id).toBe('c9')
    expect(d.code).toBe('CODE1')
    expect(sent).toEqual([{ method: 'GET', path: '/stores/v2/coupons/c9' }])
  })
})

describe('wix listLocations (Query Locations)', () => {
  it('posts query.paging to /locations/v1/locations/query instead of inventing a location', async () => {
    const { sent } = fakeWix({ locations: 3 })
    const params = withPageSink({ page: 1, limit: 10 })
    const rows = await adapter().listLocations(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['l1', 'l2', 'l3'])
    for (const r of rows) LocationSchema.parse(r)
    expect(sent).toEqual([
      {
        method: 'POST',
        path: '/locations/v1/locations/query',
        body: { query: { paging: { limit: 10, offset: 0 } } },
      },
    ])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('a site with no locations lists none', async () => {
    fakeWix({ locations: 0 })
    expect(await adapter().listLocations(CREDS, withPageSink({ page: 1, limit: 10 }))).toEqual([])
  })

  it('reads a location back by the documented GET /locations/v1/locations/{id}', async () => {
    const { sent } = fakeWix({})
    const l = await adapter().getLocation(CREDS, 'l5')
    expect(l.id).toBe('l5')
    expect(sent).toEqual([{ method: 'GET', path: '/locations/v1/locations/l5' }])
  })
})

describe.each([
  {
    method: 'listTransactions' as const,
    get: 'getTransaction' as const,
    key: 'payments',
    prefix: 'p',
  },
  { method: 'listRefunds' as const, get: 'getRefund' as const, key: 'refunds', prefix: 'r' },
])('wix $method (List Transactions For Single Order)', ({ method, get, key, prefix }) => {
  const ORDER = 'o42'
  const want = (n: number) => Array.from({ length: n }, (_, i) => `${ORDER}:${prefix}${i + 1}`)

  it('reads /ecom/v1/payments/orders/{orderId} and the order currency, not the old paths', async () => {
    const { sent } = fakeWix({ [key]: 2 })
    const rows = await adapter()[method](
      CREDS,
      withPageSink({ page: 1, limit: 10, order_id: ORDER }),
    )
    expect(rows.map((r) => r.id)).toEqual(want(2))
    expect(sent.map((s) => s.path).sort()).toEqual([
      `/ecom/v1/orders/${ORDER}`,
      `/ecom/v1/payments/orders/${ORDER}`,
    ])
    expect(rows[0]!.amount?.currency).toBe('USD')
    const schema = method === 'listRefunds' ? RefundSchema : TransactionSchema
    for (const r of rows) schema.parse(r)
  })

  it('omits amounts when the order has no currency', async () => {
    fakeWix({ [key]: 1, orderCurrency: undefined })
    const rows = await adapter()[method](
      CREDS,
      withPageSink({ page: 1, limit: 10, order_id: ORDER }),
    )
    expect(rows[0]!.amount).toBeUndefined()
  })

  it('N = 2L + 1 rows page locally: every id once, exact hasMore', async () => {
    const limit = 5
    fakeWix({ [key]: 2 * limit + 1 })
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const k of [1, 2, 3]) {
      const params = withPageSink({ page: k, limit, order_id: ORDER })
      seen.push(...(await adapter()[method](CREDS, params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(want(2 * limit + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('without order_id, walks Search Orders pages and List Transactions For Multiple Orders', async () => {
    const { sent } = fakeWix({ orders: 3, [key]: 1 })
    const rows = await adapter()[method](CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual([`o1:${prefix}1`, `o2:${prefix}1`, `o3:${prefix}1`])
    expect(sent).toEqual([
      {
        method: 'POST',
        path: '/ecom/v1/orders/search',
        body: { search: { cursorPaging: { limit: ORDERS_MAX } } },
      },
      {
        method: 'POST',
        path: '/ecom/v1/payments/list-by-ids',
        body: { orderIds: ['o1', 'o2', 'o3'] },
      },
    ])
    // Each row is priced in its own order's currency, read from the Search Orders page.
    expect(rows[0]!.amount?.currency).toBe('USD')
    const schema = method === 'listRefunds' ? RefundSchema : TransactionSchema
    for (const r of rows) schema.parse(r)
  })

  it('without order_id, each row takes its own order currency and none is invented', async () => {
    fakeWix({ orders: 1, [key]: 1, orderCurrency: 'EUR' })
    const eur = await adapter()[method](CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(eur[0]!.amount).toEqual({
      amount: method === 'listRefunds' ? 500 : 2500,
      currency: 'EUR',
    })
    vi.restoreAllMocks()
    _resetCursorPager()
    fakeWix({ orders: 1, [key]: 1, orderCurrency: undefined })
    const none = await adapter()[method](CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(none[0]!.amount).toBeUndefined()
  })

  it('without order_id, N = 2L + 1 rows over uneven order pages: every id once, exact hasMore', async () => {
    // 150 orders span two Search Orders pages (100 + 50). Only o3, o99 and
    // o101 have rows (2, 2 and 1), so the upstream pages carry 4 and 1 rows.
    const counts = (id: string) => {
      const i = Number(id.slice(1))
      if (i === 3 || i === 99) return 2
      if (i === 101) return 1
      return 0
    }
    const all = [
      `o3:${prefix}1`,
      `o3:${prefix}2`,
      `o99:${prefix}1`,
      `o99:${prefix}2`,
      `o101:${prefix}1`,
    ]
    const limit = 2
    fakeWix({ orders: 150, perOrder: counts })
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const k of [1, 2, 3]) {
      const params = withPageSink({ page: k, limit })
      seen.push(...(await adapter()[method](CREDS, params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(all)
    expect(hasMore).toEqual([true, true, false])
  })

  it('reads a row back by its orderId:childId id', async () => {
    fakeWix({ [key]: 3 })
    const row = await adapter()[get](CREDS, `${ORDER}:${prefix}2`)
    expect(row.id).toBe(`${ORDER}:${prefix}2`)
  })

  it('refuses a bare id with no order before sending anything', async () => {
    const { sent } = fakeWix({ [key]: 3 })
    await expect(adapter()[get](CREDS, `${prefix}2`)).rejects.toMatchObject({ statusCode: 400 })
    expect(sent).toEqual([])
  })
})
