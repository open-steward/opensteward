/**
 * Dukaan list methods: request shape, paging walk, and refusals.
 *
 * Every path and parameter comes from Dukaan's published Postman collection
 * (https://documenter.getpostman.com/view/25389466/2s9Yynk3f7, raw JSON at
 * https://documenter.gw.postman.com/api/collections/25389466/2s9Yynk3f7?segregateAuth=true&versionTag=latest):
 *
 *   product_list            GET https://api.mydukaan.io/api/seller-front/{{store_uuid}}/product-list/?ordering=-created_at&page=1&page_size=30&pop_fields=variants_data
 *                           page_size "1-99 ( max 99 results allowed per page )"; envelope { status_code, count, results }
 *   get_category_list       GET https://api.mydukaan.io/api/product/seller/product-category/?page=1&page_size=30&v2=true
 *                           envelope { count, next, previous, results }
 *   get_store_audience_list GET https://api.mydukaan.io/api/store/seller/store-buyer/?ordering=-orders_total_cost&page=1&page_size=30
 *   get order list          GET https://api.mydukaan.io/api/seller-front/order-list/?created_at_after=2024-02-05&created_at_before=2024-02-12&ordering=-created_at&page=1&utm_data=True
 *                           (no page size documented); envelope { status_code, count, results }
 *   get_discounts           GET https://api.mydukaan.io/api/coupon/seller/coupon/v2/?page_size=30&page=1&search=
 *
 * Auth, from the Important Keys table: "authorization | Bearer {store_authentication_token}".
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import { _resetRowPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { DukaanAdapter } from '../../../../../../src/verticals/ecommerce/adapters/dukaan/index'
import {
  AUDIENCE_ROW,
  CATEGORY_ROW,
  COUPON_ROW,
  ORDER_DETAIL,
  ORDER_LIST_ROW,
  PRODUCT_DETAIL,
  PRODUCT_LIST_ROW,
  STORE_LEAD,
} from './fixtures'

const STORE = 'af4336ad-3b45-4781-90dc-f9a0296a0ed7'
const CREDS = { accessToken: 'dk_test_token', extra: { storeUuid: STORE } }
const NO_STORE = { accessToken: 'dk_test_token' }
const HOST = 'https://api.mydukaan.io'

/** The only query parameters each documented list request carries. */
const DOCUMENTED: Record<string, string[]> = {
  [`/api/seller-front/${STORE}/product-list/`]: [
    'ordering',
    'page',
    'page_size',
    'pop_fields',
    'search',
  ],
  '/api/product/seller/product-category/': ['page', 'page_size', 'v2', 'search'],
  '/api/store/seller/store-buyer/': ['ordering', 'page', 'page_size'],
  '/api/seller-front/order-list/': [
    'created_at_after',
    'created_at_before',
    'ordering',
    'page',
    'search',
    'utm_data',
  ],
  '/api/coupon/seller/coupon/v2/': ['page_size', 'page', 'search'],
}

/** A fixed server-side page for the order list, which documents no page size. */
const ORDER_SERVER_PAGE = 7

interface Sent {
  path: string
  params: Record<string, unknown>
}

interface FakeOptions {
  /** Store tokens the fake accepts; rows of any token but the first are prefixed with it. */
  tokens?: string[]
  /** The order list's `count`, when it should disagree with the rows served (a stale count). */
  orderCount?: number
}

function rowsFor(path: string, total: number, prefix = ''): Record<string, unknown>[] {
  const base: Record<string, unknown> = path.includes('product-list')
    ? PRODUCT_LIST_ROW
    : path.includes('product-category')
      ? CATEGORY_ROW
      : path.includes('store-buyer')
        ? AUDIENCE_ROW
        : path.includes('order-list')
          ? ORDER_LIST_ROW
          : COUPON_ROW
  return Array.from({ length: total }, (_, i) => ({
    ...structuredClone(base),
    id: 1000 + i,
    uuid: `${prefix}uuid-${i + 1}`,
  }))
}

/**
 * A fake Dukaan that honours only the documented parameters: an unknown
 * query key, a page_size outside the product list's documented 1-99, or a
 * missing Bearer header is refused rather than ignored.
 */
function fakeDukaan(total: number, opts: FakeOptions = {}) {
  const tokens = opts.tokens ?? ['dk_test_token']
  const sent: Sent[] = []
  // The store token each request carried, in request order (undefined when unrecognised).
  const sentTokens: (string | undefined)[] = []
  type Cfg = { baseURL?: string; headers?: Record<string, string> }
  let createConfig: Cfg | undefined
  const get = vi.fn(
    async (path: string, config?: { params?: Record<string, unknown> }, client?: Cfg) => {
      const params = config?.params ?? {}
      const auth = client?.headers?.['Authorization'] ?? ''
      const token = tokens.find((t) => auth === `Bearer ${t}`)
      sent.push({ path, params })
      sentTokens.push(token)
      if (token === undefined) {
        throw Object.assign(new Error('401'), { status: 401 })
      }
      const prefix = token === tokens[0] ? '' : `${token}-`
      if (
        path === `/api/product/seller/${STORE}/product/f378cb09-0b84-4b0d-a4b9-f9d65b6ce4f3/v2/`
      ) {
        return {
          data: {
            status_code: 202,
            status: 'success',
            detail: '',
            data: structuredClone(PRODUCT_DETAIL),
          },
        }
      }
      if (path === '/api/campaign/seller/store-lead/v2/store-lead-data/21881957/') {
        return {
          data: {
            status_code: 200,
            status: 'success',
            detail: '',
            data: structuredClone(STORE_LEAD),
          },
        }
      }
      if (path === '/api/order/seller/7be5afc5-96e7-4852-91bd-1c6cd9fed408/order/') {
        return {
          data: {
            status_code: 200,
            status: 'success',
            detail: '',
            data: structuredClone(ORDER_DETAIL),
          },
        }
      }
      const allowed = DOCUMENTED[path]
      if (!allowed) throw Object.assign(new Error(`404 ${path}`), { status: 404 })
      const unknown = Object.keys(params).filter((k) => !allowed.includes(k))
      if (unknown.length > 0)
        throw Object.assign(new Error(`unknown params ${unknown.join(',')}`), { status: 400 })
      const page = params['page'] as number
      if (!Number.isInteger(page) || page < 1)
        throw Object.assign(new Error('bad page'), { status: 400 })
      const all = rowsFor(path, total, prefix)
      if (path === '/api/seller-front/order-list/') {
        const results = all.slice((page - 1) * ORDER_SERVER_PAGE, page * ORDER_SERVER_PAGE)
        return { data: { status_code: 200, count: opts.orderCount ?? total, results } }
      }
      const size = params['page_size'] as number
      if (!Number.isInteger(size) || size < 1)
        throw Object.assign(new Error('bad page_size'), { status: 400 })
      if (path.includes('product-list') && size > 99) {
        throw Object.assign(new Error('page_size over 99'), { status: 400 })
      }
      const results = all.slice((page - 1) * size, page * size)
      if (path.includes('product-list')) {
        return { data: { status_code: 200, count: total, results } }
      }
      const next = page * size < total ? `${HOST}${path}?page=${page + 1}&page_size=${size}` : null
      return { data: { count: total, next, previous: null, results } }
    },
  )
  vi.spyOn(axios, 'create').mockImplementation(((config: Cfg) => {
    createConfig = config
    return {
      get: (path: string, cfg?: { params?: Record<string, unknown> }) => get(path, cfg, config),
    } as unknown as ReturnType<typeof axios.create>
  }) as unknown as typeof axios.create)
  return { sent, sentTokens, get, config: () => createConfig }
}

const adapter = () => new DukaanAdapter()

function params(page: number, limit: number, extra: Partial<QueryParams> = {}): QueryParams {
  return withPageSink({ page, limit, ...extra })
}

type ListMethod =
  'listProducts' | 'listCollections' | 'listCustomers' | 'listOrders' | 'listDiscounts'

async function walk(method: ListMethod, total: number, limit: number) {
  const a = adapter()
  const seen: string[] = []
  const hasMore: (boolean | undefined)[] = []
  for (let page = 1; page <= Math.ceil(total / limit); page++) {
    const p = params(page, limit)
    const rows = await a[method](CREDS, p)
    seen.push(...rows.map((r) => r.id))
    hasMore.push(readUpstreamPage(p)?.hasMore)
  }
  return { seen, hasMore }
}

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

describe('client', () => {
  it('sends the store token as a Bearer header to api.mydukaan.io', async () => {
    const fake = fakeDukaan(1)
    await adapter().listCollections(CREDS, params(1, 10))
    expect(fake.config()?.baseURL).toBe(HOST)
    expect(fake.config()?.headers?.['Authorization']).toBe('Bearer dk_test_token')
  })
})

describe('request shape', () => {
  it('listProducts: product_list on the connection store uuid, caller page and page_size', async () => {
    const fake = fakeDukaan(3)
    await adapter().listProducts(CREDS, params(2, 10, { search: 'Hair Pins' }))
    expect(fake.sent).toEqual([
      {
        path: `/api/seller-front/${STORE}/product-list/`,
        params: {
          ordering: '-created_at',
          page: 2,
          page_size: 10,
          pop_fields: 'variants_data',
          search: 'Hair Pins',
        },
      },
    ])
  })

  it('listProducts clamps page_size to the documented 99 and reports the size sent', async () => {
    const fake = fakeDukaan(300)
    const p = params(1, 150)
    const rows = await adapter().listProducts(CREDS, p)
    expect(fake.sent[0]?.params['page_size']).toBe(99)
    expect(rows).toHaveLength(99)
    expect(readUpstreamPage(p)).toMatchObject({ pageSize: 99, totalCount: 300, hasMore: true })
  })

  it('listCollections: get_category_list with v2=true', async () => {
    const fake = fakeDukaan(3)
    await adapter().listCollections(CREDS, params(3, 25, { search: 'Sample Category' }))
    expect(fake.sent).toEqual([
      {
        path: '/api/product/seller/product-category/',
        params: { v2: true, search: 'Sample Category', page: 3, page_size: 25 },
      },
    ])
  })

  it('listCustomers: get_store_audience_list with page and page_size', async () => {
    const fake = fakeDukaan(3)
    await adapter().listCustomers(CREDS, params(2, 15))
    expect(fake.sent).toEqual([
      { path: '/api/store/seller/store-buyer/', params: { page: 2, page_size: 15 } },
    ])
  })

  it('listOrders: get order list with ordering and page only (no page size is documented)', async () => {
    const fake = fakeDukaan(3)
    await adapter().listOrders(CREDS, params(1, 10, { search: '12631944' }))
    expect(fake.sent).toEqual([
      {
        path: '/api/seller-front/order-list/',
        params: { ordering: '-created_at', page: 1, search: '12631944' },
      },
    ])
  })

  it('listDiscounts: get_discounts with page and page_size', async () => {
    const fake = fakeDukaan(3)
    await adapter().listDiscounts(CREDS, params(4, 30))
    expect(fake.sent).toEqual([
      { path: '/api/coupon/seller/coupon/v2/', params: { page: 4, page_size: 30 } },
    ])
  })

  it('getProduct reads product_details on the connection store uuid', async () => {
    const fake = fakeDukaan(0)
    const p = await adapter().getProduct(CREDS, 'f378cb09-0b84-4b0d-a4b9-f9d65b6ce4f3')
    expect(fake.sent[0]?.path).toBe(
      `/api/product/seller/${STORE}/product/f378cb09-0b84-4b0d-a4b9-f9d65b6ce4f3/v2/`,
    )
    expect(p.title).toBe('Hair Pins')
  })

  it('getCustomer reads get_customer_details by the list id', async () => {
    const fake = fakeDukaan(0)
    const c = await adapter().getCustomer(CREDS, '21881957')
    expect(fake.sent[0]?.path).toBe('/api/campaign/seller/store-lead/v2/store-lead-data/21881957/')
    expect(c.id).toBe('21881957')
  })

  it('getOrder reads get order data by the order uuid', async () => {
    const fake = fakeDukaan(0)
    const o = await adapter().getOrder(CREDS, '7be5afc5-96e7-4852-91bd-1c6cd9fed408')
    expect(fake.sent[0]?.path).toBe('/api/order/seller/7be5afc5-96e7-4852-91bd-1c6cd9fed408/order/')
    expect(o.totalPrice).toEqual({ amount: 2890000, currency: 'INR' })
  })
})

describe('paging walk (N = 2L + 1)', () => {
  const L = 5
  const N = 2 * L + 1
  const every = Array.from({ length: N }, (_, i) => `uuid-${i + 1}`)

  it.each([
    'listProducts',
    'listCollections',
    'listCustomers',
    'listDiscounts',
    'listOrders',
  ] as const)('%s reports hasMore false on a full last page (N = 2L)', async (method) => {
    fakeDukaan(2 * L)
    const { seen, hasMore } = await walk(method, 2 * L, L)
    expect(seen).toHaveLength(2 * L)
    expect(new Set(seen).size).toBe(2 * L)
    expect(hasMore).toEqual([true, false])
  })

  it.each(['listProducts', 'listCollections', 'listDiscounts', 'listOrders'] as const)(
    '%s serves every id once with exact hasMore',
    async (method) => {
      fakeDukaan(N)
      const { seen, hasMore } = await walk(method, N, L)
      expect(seen).toEqual(every)
      expect(hasMore).toEqual([true, true, false])
    },
  )

  it('listCustomers serves every id once with exact hasMore', async () => {
    fakeDukaan(N)
    const { seen, hasMore } = await walk('listCustomers', N, L)
    expect(seen).toEqual(every.map((_, i) => String(1000 + i)))
    expect(hasMore).toEqual([true, true, false])
  })

  it('listOrders cuts caller pages out of uneven upstream pages, one request per upstream page', async () => {
    const fake = fakeDukaan(N)
    await walk('listOrders', N, L)
    // 11 rows at 7 per upstream page: pages 1 and 2, each fetched once.
    expect(fake.sent.map((s) => s.params['page'])).toEqual([1, 2])
  })

  it('listOrders ends on a full last upstream page by count', async () => {
    const fake = fakeDukaan(ORDER_SERVER_PAGE)
    const p = params(1, ORDER_SERVER_PAGE)
    const rows = await adapter().listOrders(CREDS, p)
    expect(rows).toHaveLength(ORDER_SERVER_PAGE)
    expect(readUpstreamPage(p)?.hasMore).toBe(false)
    expect(fake.sent).toHaveLength(1)
  })

  it('listOrders ends on an empty upstream page even when a stale count says more remain', async () => {
    // 7 rows served, count claims 20: page 2 of the order list comes back empty.
    const fake = fakeDukaan(ORDER_SERVER_PAGE, { orderCount: 20 })
    const p = params(2, L)
    const rows = await adapter().listOrders(CREDS, p)
    expect(rows.map((r) => r.id)).toEqual(['uuid-6', 'uuid-7'])
    expect(readUpstreamPage(p)?.hasMore).toBe(false)
    expect(fake.sent.map((s) => s.params['page'])).toEqual([1, 2])
  })
})

describe('listOrders row-pager key isolation', () => {
  const L = 5

  it("never serves one connection's buffered rows to another", async () => {
    const OTHER = { accessToken: 'dk_other_token' }
    const fake = fakeDukaan(11, { tokens: ['dk_test_token', 'dk_other_token'] })
    const a = adapter()
    await a.listOrders(CREDS, params(1, L))
    const rows = await a.listOrders(OTHER, params(2, L))
    expect(rows.map((r) => r.id)).toEqual([6, 7, 8, 9, 10].map((i) => `dk_other_token-uuid-${i}`))
    expect(fake.sentTokens).toContain('dk_other_token')
  })

  it('never serves unfiltered buffered rows to a search walk', async () => {
    const fake = fakeDukaan(11)
    const a = adapter()
    await a.listOrders(CREDS, params(1, L))
    await a.listOrders(CREDS, params(2, L, { search: '12631944' }))
    expect(fake.sent.slice(1).map((s) => s.params)).toContainEqual({
      ordering: '-created_at',
      page: 1,
      search: '12631944',
    })
  })
})

describe('page size and totals on the next-link lists', () => {
  it.each(['listCollections', 'listCustomers', 'listDiscounts'] as const)(
    '%s sends the documented page_size 30 when the caller gives no limit, and reports count',
    async (method) => {
      const fake = fakeDukaan(40)
      const p = withPageSink({ page: 1 })
      const rows = await adapter()[method](CREDS, p)
      expect(fake.sent[0]?.params['page_size']).toBe(30)
      expect(rows).toHaveLength(30)
      expect(readUpstreamPage(p)).toMatchObject({ totalCount: 40, hasMore: true })
    },
  )
})

describe('refusals send no request', () => {
  const refusals: [string, (a: DukaanAdapter) => Promise<unknown>][] = [
    ['listProducts without a store uuid', (a) => a.listProducts(NO_STORE, params(1, 10))],
    ['getProduct without a store uuid', (a) => a.getProduct(NO_STORE, 'x')],
    ['listVariants', (a) => a.listVariants(CREDS, params(1, 10, { productId: 'x' }))],
    ['getVariant', (a) => a.getVariant(CREDS, 'x')],
    ['getCollection', (a) => a.getCollection(CREDS, 'x')],
    ['getDiscount', (a) => a.getDiscount(CREDS, 'x')],
  ]

  it.each(refusals)('%s throws 501 NOT_SUPPORTED', async (_name, call) => {
    const fake = fakeDukaan(3)
    await expect(call(adapter())).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(fake.get).not.toHaveBeenCalled()
  })

  it('listCustomers refuses search: the audience list documents none', async () => {
    const fake = fakeDukaan(3)
    await expect(
      adapter().listCustomers(CREDS, params(1, 10, { search: 'neel' })),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'SEARCH_UNSUPPORTED',
    })
    expect(fake.get).not.toHaveBeenCalled()
  })
})

describe('connect form', () => {
  it('stores the store uuid on credentials.extra', async () => {
    const creds = await adapter().exchangeCredentials({ apiKey: ' tok ', storeUuid: ` ${STORE} ` })
    expect(creds).toEqual({ accessToken: 'tok', extra: { storeUuid: STORE } })
  })

  it('accepts a token alone', async () => {
    expect(await adapter().exchangeCredentials({ apiKey: 'tok' })).toEqual({ accessToken: 'tok' })
  })
})
