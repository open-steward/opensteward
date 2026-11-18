/**
 * Swell list methods: host, auth, request shape and paging.
 *
 * Swell Backend API (https://developers.swell.is/backend-api/introduction):
 *   "Base URL https://api.swell.store"
 * Auth (https://developers.swell.is/backend-api/authentication):
 *   "authenticate with basic auth using your store ID as the username and a
 *   secret key as the password"
 * Paging (https://developers.swell.is/backend-api/querying):
 *   limit "A number indicating the max number of results to return up to 1000."
 *   page  "A number indicating which page of results to return." ("Defaults to 1.")
 *   "Paginated responses include count (total matching records), results,
 *   page, limit, page_count, and a pages map"
 *
 * The fake upstream honours only the documented list arguments (limit, page,
 * where, search, expand) and fails the test on anything else.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios, { type AxiosRequestConfig } from 'axios'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { SwellAdapter } from '../../../../../../src/verticals/ecommerce/adapters/swell/index'

const CREDS: Credentials = { accessToken: 'sk_test_secret', extra: { storeId: 'my-store' } }
const DOCUMENTED_ARGS = new Set(['limit', 'page', 'where', 'search', 'expand'])

interface Call {
  path: string
  params: Record<string, unknown> | undefined
}

/** A minimal valid row for each documented list path. */
function row(path: string, i: number): Record<string, unknown> {
  const id = `r${i}`
  switch (path) {
    case '/products':
      return { id, name: `Product ${i}`, active: true }
    case '/products:variants':
      return { id, parent_id: 'p1', name: `V ${i}`, currency: 'USD', price: 1.5 }
    case '/categories':
      return { id, name: `Category ${i}`, slug: `c-${i}` }
    case '/accounts':
      return { id, email: `a${i}@example.com` }
    case '/orders':
      return { id, number: String(1000 + i), currency: 'USD', grand_total: 10, items: [] }
    case '/shipments':
      return { id, order_id: 'o1', items: [] }
    case '/payments':
      return { id, amount: 5, currency: 'USD', status: 'success' }
    case '/payments:refunds':
      return { id, order_id: 'o1', amount: 1, currency: 'USD' }
    case '/coupons':
      return { id, name: `Coupon ${i}` }
    default:
      throw new Error(`unexpected path in test: ${path}`)
  }
}

function fake(n: number) {
  const calls: Call[] = []
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = config?.params
    calls.push({ path, params })
    for (const k of Object.keys(params ?? {})) {
      if (!DOCUMENTED_ARGS.has(k)) throw new Error(`undocumented argument sent: ${k}`)
    }
    const limit = (params?.['limit'] as number | undefined) ?? 15
    const page = (params?.['page'] as number | undefined) ?? 1
    const all = Array.from({ length: n }, (_, i) => row(path, i + 1))
    return {
      data: {
        count: n,
        results: all.slice((page - 1) * limit, page * limit),
        page,
        limit,
        page_count: Math.ceil(n / limit),
      },
    }
  })
  const create = vi.spyOn(axios, 'create').mockReturnValue({ get, defaults: {} } as never)
  return { calls, get, create, ids: Array.from({ length: n }, (_, i) => `r${i + 1}`) }
}

type ListMethod =
  | 'listProducts'
  | 'listVariants'
  | 'listCollections'
  | 'listCustomers'
  | 'listOrders'
  | 'listFulfillments'
  | 'listTransactions'
  | 'listRefunds'
  | 'listDiscounts'

const METHODS: Array<[ListMethod, string]> = [
  ['listProducts', '/products'],
  ['listVariants', '/products:variants'],
  ['listCollections', '/categories'],
  ['listCustomers', '/accounts'],
  ['listOrders', '/orders'],
  ['listFulfillments', '/shipments'],
  ['listTransactions', '/payments'],
  ['listRefunds', '/payments:refunds'],
  ['listDiscounts', '/coupons'],
]

async function call(m: ListMethod, params: QueryParams): Promise<string[]> {
  const rows = (await new SwellAdapter()[m](CREDS, params)) as Array<{ id: string }>
  return rows.map((r) => r.id)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Swell client', () => {
  it('calls the Backend API host with Basic storeId:secretKey', async () => {
    const { create } = fake(1)
    await call('listProducts', withPageSink({ page: 1, limit: 5 } as QueryParams))
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://api.swell.store',
        auth: { username: 'my-store', password: 'sk_test_secret' },
      }),
    )
  })

  it('declares the documented 1000-row maximum', () => {
    expect(new SwellAdapter().capabilities.maxPageSize).toBe(1000)
  })

  it('collects the store ID and secret key the documented auth needs', async () => {
    const a = new SwellAdapter()
    expect(a.credentialFields().map((f) => f.name)).toEqual(['storeId', 'secretKey'])
    await expect(
      a.exchangeCredentials({ storeId: ' my-store ', secretKey: 'sk_live_x' }),
    ).resolves.toEqual({
      accessToken: 'sk_live_x',
      extra: { storeId: 'my-store' },
    })
    await expect(a.exchangeCredentials({ secretKey: 'sk_live_x' })).rejects.toThrow(/Store ID/)
  })
})

describe.each(METHODS)('Swell %s paging', (method, path) => {
  it('serves 2L+1 rows once each across pages 1..3 with exact hasMore', async () => {
    for (const L of [3, 17]) {
      vi.restoreAllMocks()
      const { ids: all, calls } = fake(2 * L + 1)
      const seen: string[] = []
      const hasMore: (boolean | undefined)[] = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L } as QueryParams)
        seen.push(...(await call(method, params)))
        const up = readUpstreamPage(params)
        hasMore.push(up?.hasMore)
        expect(up?.totalCount).toBe(2 * L + 1)
        expect(up?.pagedLocally).toBeUndefined()
      }
      expect(seen).toEqual(all)
      expect(hasMore).toEqual([true, true, false])
      expect(calls.map((c) => [c.path, c.params?.['page'], c.params?.['limit']])).toEqual([
        [path, 1, L],
        [path, 2, L],
        [path, 3, L],
      ])
    }
  })

  it('reads the end from count, not from a full page, when the total is a multiple of the limit', async () => {
    fake(6)
    const p2 = withPageSink({ page: 2, limit: 3 } as QueryParams)
    expect(await call(method, p2)).toEqual(['r4', 'r5', 'r6'])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('clamps a limit above 1000 and reports the size it sent', async () => {
    const { calls } = fake(3)
    const params = withPageSink({ page: 1, limit: 5000 } as QueryParams)
    await call(method, params)
    expect(calls[0]?.params?.['limit']).toBe(1000)
    expect(readUpstreamPage(params)?.pageSize).toBe(1000)
  })

  it('sends updatedAfter as where[date_updated][$gte] and search as search', async () => {
    const { calls } = fake(1)
    const since = new Date('2026-01-02T03:04:05.000Z')
    await call(
      method,
      withPageSink({ page: 1, limit: 5, updatedAfter: since, search: 'blue' } as QueryParams),
    )
    const where = calls[0]?.params?.['where'] as Record<string, unknown>
    expect(where['date_updated']).toEqual({ $gte: '2026-01-02T03:04:05.000Z' })
    expect(calls[0]?.params?.['search']).toBe('blue')
    expect(calls[0]?.params).not.toHaveProperty('$expand')
  })
})

describe('Swell request filters', () => {
  it('listVariants expands the parent and narrows to a product via where[parent_id]', async () => {
    const { calls } = fake(1)
    await call('listVariants', withPageSink({ page: 1, limit: 5 } as QueryParams))
    await call('listVariants', withPageSink({ page: 1, limit: 5, product_id: 'p1' } as QueryParams))
    expect(calls[0]?.params).toEqual({ expand: 'parent', limit: 5, page: 1 })
    expect(calls[1]?.params).toEqual({
      where: { parent_id: 'p1' },
      expand: 'parent',
      limit: 5,
      page: 1,
    })
  })

  it('listFulfillments narrows to an order via where[order_id]', async () => {
    const { calls } = fake(1)
    await call(
      'listFulfillments',
      withPageSink({ page: 1, limit: 5, order_id: 'o1' } as QueryParams),
    )
    expect(calls[0]?.params).toEqual({ where: { order_id: 'o1' }, limit: 5, page: 1 })
  })

  it("listRefunds lists successful refunds with an order, or one order's", async () => {
    const { calls } = fake(1)
    await call('listRefunds', withPageSink({ page: 1, limit: 5 } as QueryParams))
    await call('listRefunds', withPageSink({ page: 1, limit: 5, orderId: 'o1' } as QueryParams))
    expect(calls[0]?.params).toEqual({
      where: { order_id: { $exists: true }, status: 'success' },
      limit: 5,
      page: 1,
    })
    expect(calls[1]?.params).toEqual({
      where: { order_id: 'o1', status: 'success' },
      limit: 5,
      page: 1,
    })
  })

  it('serialises where filters into the documented bracket query string', async () => {
    const { calls, create } = fake(1)
    await call(
      'listRefunds',
      withPageSink({
        page: 2,
        limit: 5,
        updatedAfter: new Date('2026-01-02T03:04:05.000Z'),
      } as QueryParams),
    )
    // Build the URL the client's own axios config would send.
    const config = (create.mock.calls[0]?.[0] ?? {}) as AxiosRequestConfig
    const url = decodeURIComponent(
      axios.getUri({ ...config, url: calls[0]?.path, params: calls[0]?.params }),
    )
    expect(url).toBe(
      'https://api.swell.store/payments:refunds?where[order_id][$exists]=true' +
        '&where[status]=success&where[date_updated][$gte]=2026-01-02T03:04:05.000Z' +
        '&limit=5&page=2',
    )
  })

  it('fails loudly when the list envelope has no results array', async () => {
    const { get } = fake(1)
    get.mockResolvedValueOnce({ data: { count: 3 } } as never)
    await expect(
      call('listProducts', withPageSink({ page: 1, limit: 5 } as QueryParams)),
    ).rejects.toThrow(/no results array/)
  })

  it('the other lists send only limit and page', async () => {
    const { calls } = fake(1)
    for (const m of [
      'listProducts',
      'listCollections',
      'listCustomers',
      'listOrders',
      'listTransactions',
      'listDiscounts',
    ] as const) {
      await call(m, withPageSink({ page: 2, limit: 4 } as QueryParams))
    }
    for (const c of calls) expect(c.params).toEqual({ limit: 4, page: 2 })
  })
})

describe('Swell read-back by id', () => {
  it('reads each resource from the documented retrieve path', async () => {
    const { calls, get } = fake(0)
    get.mockImplementation(async (p: string, config?: { params?: Record<string, unknown> }) => {
      calls.push({ path: p, params: config?.params })
      const path = p.replace(/\/[^/]+$/, '')
      return { data: row(path, 1) } as never
    })
    const a = new SwellAdapter()
    await a.getProduct(CREDS, 'r1')
    await a.getVariant(CREDS, 'r1')
    await a.getCollection(CREDS, 'r1')
    await a.getCustomer(CREDS, 'r1')
    await a.getOrder(CREDS, 'r1')
    await a.getFulfillment(CREDS, 'r1')
    await a.getTransaction(CREDS, 'r1')
    await a.getRefund(CREDS, 'r1')
    await a.getDiscount(CREDS, 'r1')
    expect(calls.map((c) => [c.path, c.params])).toEqual([
      ['/products/r1', undefined],
      ['/products:variants/r1', { expand: 'parent' }],
      ['/categories/r1', undefined],
      ['/accounts/r1', undefined],
      ['/orders/r1', undefined],
      ['/shipments/r1', undefined],
      ['/payments/r1', undefined],
      ['/payments:refunds/r1', undefined],
      ['/coupons/r1', undefined],
    ])
  })
})

describe('Swell inventory', () => {
  it('listInventoryLevels refuses with 501 NOT_SUPPORTED and sends nothing', async () => {
    const { get } = fake(1)
    await expect(
      new SwellAdapter().listInventoryLevels(
        CREDS,
        withPageSink({ page: 1, limit: 5 } as QueryParams),
      ),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    await expect(new SwellAdapter().getInventoryLevel(CREDS, 'x')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(get).not.toHaveBeenCalled()
  })
})
