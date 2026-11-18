/**
 * LogiCommerce adapter: host, auth, request shape, paging and refusals, with
 * HTTP faked at `axios.create`. The fake serves API Sync's documented
 * page/perPage paging and rejects any query parameter an endpoint does not
 * document.
 *
 * Docs: https://api-sync.logicommerce.cloud/docs/guide.cfm?languageId=2,
 * https://api-sync.logicommerce.cloud/docs/guide.cfm?module=authentication&languageId=2,
 * https://api-sync.logicommerce.cloud/docs/reference.cfm?module={products,categories,physicalLocations,accounts,sales,vouchers}&languageId=2
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { LogicommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapters/logicommerce/index'
import { apiSyncToken } from '../../../../../../src/verticals/ecommerce/adapters/logicommerce/auth'
import { ProductSchema } from '../../../../../../src/verticals/ecommerce/schema/product'
import { CollectionSchema } from '../../../../../../src/verticals/ecommerce/schema/collection'
import { LocationSchema } from '../../../../../../src/verticals/ecommerce/schema/location'
import { CustomerSchema } from '../../../../../../src/verticals/ecommerce/schema/customer'
import { OrderSchema } from '../../../../../../src/verticals/ecommerce/schema/order'
import { FulfillmentSchema } from '../../../../../../src/verticals/ecommerce/schema/fulfillment'
import { RefundSchema } from '../../../../../../src/verticals/ecommerce/schema/refund'
import { fixture } from './fixtures/load'

const CFG = { clientId: 'cid', clientSecret: 'csec', redirectUri: 'https://x/cb', shop: 'unused' }
/** The authentication guide's own example credentials. */
const APP_ID = 'hCN3fdW'
const APP_KEY = 'TcA1tG1V7q'
const CREDS: Credentials = { accessToken: APP_KEY, extra: { appId: APP_ID } }

afterEach(() => vi.restoreAllMocks())

type Query = Record<string, unknown>
interface Call {
  path: string
  params?: Query
}

/** Documented URL input parameters per list path (the fake rejects any other). */
const DOCUMENTED: Record<string, string[]> = {
  '/products': [
    'brandId',
    'brandsList',
    'categoriesList',
    'categoryId',
    'fields',
    'idList',
    'languageCode',
    'page',
    'perPage',
    'q',
    'showOnlyVisible',
    'sort',
  ],
  '/categories': [
    'areaId',
    'fields',
    'idList',
    'languageCode',
    'page',
    'parentId',
    'perPage',
    'priority',
    'q',
    'sort',
  ],
  '/physicalLocations': ['fields', 'languageCode', 'page', 'perPage', 'q'],
  '/accounts': [
    'addedFrom',
    'addedTo',
    'groupIdList',
    'idFrom',
    'lastUsedFrom',
    'lastUsedTo',
    'name',
    'pId',
    'page',
    'perPage',
    'q',
    'salesAgentId',
    'sort',
    'statusList',
    'typeList',
  ],
  '/orders': [
    'authNumber',
    'deliveryDate',
    'endDate',
    'fromOrderNumber',
    'headquarters',
    'page',
    'paymentDate',
    'paymentState',
    'paymentSystems',
    'perPage',
    'q',
    'sort',
    'startDate',
    'statuses',
    'substatuses',
    'toOrderNumber',
    'transactionId',
    'userId',
  ],
}

function fake(handler: (path: string, params: Query) => unknown) {
  const calls: Call[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Query }) => {
    const params = cfg?.params ?? {}
    const allowed = DOCUMENTED[path] ?? []
    const extra = Object.keys(params).filter((k) => !allowed.includes(k))
    if (extra.length) throw new Error(`undocumented params ${extra.join(',')} on ${path}`)
    calls.push({ path, params: cfg?.params })
    return { data: handler(path, params) }
  })
  const create = vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return { calls, create, get }
}

/** page/perPage over `rows`, 1-based as documented ("page Optional 1"). */
function slice<T>(rows: T[], params: Query): { rows: T[]; page: number; perPage: number } {
  const page = Number(params.page)
  const perPage = Number(params.perPage)
  if (!(Number.isInteger(page) && page >= 1)) throw new Error(`page ${String(params.page)}`)
  if (!(Number.isInteger(perPage) && perPage >= 1))
    throw new Error(`perPage ${String(params.perPage)}`)
  return { rows: rows.slice((page - 1) * perPage, page * perPage), page, perPage }
}

/** A CURSORS-style page, as GET /products documents it; NEXT is "" on the last page. */
function cursorsBody<T>(key: string, path: string, rows: T[], params: Query) {
  const s = slice(rows, params)
  const more = s.page * s.perPage < rows.length
  return {
    CURSORS: {
      NEXT: more
        ? `http://api-sync.logicommerce.cloud/v1${path}?page=${s.page + 1}&perPage=${s.perPage}`
        : '',
      PREVIOUS: '',
    },
    ITEMS: rows.length,
    PAGERPARAMETERS: { PAGE: s.page, PERPAGE: s.perPage },
    [key]: s.rows,
  }
}

const product = (id: number) => ({
  ID: id,
  PID: `p${id}`,
  LANGUAGES: [{ LANGUAGE: 'EN', NAME: `Product ${id}` }],
})
const category = (id: number) => ({
  ID: id,
  LANGUAGES: [{ LANGUAGE: 'EN', NAME: `Category ${id}` }],
})
const location = (id: number) => ({ ID: id, NAME: `Store ${id}`, ACTIVE: true })
const account = (id: number) => ({
  ID: id,
  DATEADDED: '2019-08-24T14:15:22Z',
  MASTER: { EMAIL: `a${id}@example.com` },
})
const order = (id: number) => ({
  ID: id,
  DOCUMENTNUMBER: String(1000 + id),
  DATE: '2021-09-13T09:23:17+02:00',
})

type ListFn = (c: Credentials, p: QueryParams) => Promise<Array<{ id: string }>>
function call(adapter: LogicommerceAdapter, method: string, params: QueryParams) {
  const fn = (adapter as unknown as Record<string, ListFn>)[method]!
  return fn.call(adapter, CREDS, params)
}

/** Walk pages 1..n at `limit` through a page sink; return ids and each page's report. */
async function walk(method: string, limit: number, pages: number, extra: QueryParams = {}) {
  const adapter = new LogicommerceAdapter(CFG)
  const ids: string[] = []
  const reports: Array<ReturnType<typeof readUpstreamPage>> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit, ...extra })
    const rows = await call(adapter, method, params)
    ids.push(...rows.map((r) => r.id))
    reports.push(readUpstreamPage(params))
  }
  return { ids, reports }
}

describe('LogicommerceAdapter auth', () => {
  it('builds the token as base64(bin(hash(appId+appKey, sha-256))), matching the guide’s example', () => {
    expect(apiSyncToken(APP_ID, APP_KEY)).toBe('NdRA6F49RAHfa20kg5uZOcFQm1H+TxKfAqU5jOZri+8=')
  })

  it('calls the production API Sync host with the appId and Basic token headers', async () => {
    const { create } = fake(() => ({}))
    await call(new LogicommerceAdapter(CFG), 'listProducts', { page: 1, limit: 10 })
    expect(create.mock.calls[0]![0]).toMatchObject({
      baseURL: 'https://api-sync.logicommerce.cloud/v1',
      headers: expect.objectContaining({
        appId: APP_ID,
        Authorization: 'Basic NdRA6F49RAHfa20kg5uZOcFQm1H+TxKfAqU5jOZri+8=',
      }),
    })
  })

  it('refuses to call without an appId, sending nothing', async () => {
    const { get } = fake(() => ({}))
    const adapter = new LogicommerceAdapter(CFG)
    await expect(
      adapter.listProducts({ accessToken: APP_KEY }, { page: 1, limit: 10 }),
    ).rejects.toThrow(/appId/)
    expect(get).not.toHaveBeenCalled()
  })

  it('refuses to call without an appKey, sending nothing', async () => {
    const { get, create } = fake(() => ({}))
    const adapter = new LogicommerceAdapter(CFG)
    await expect(
      adapter.listProducts({ accessToken: '', extra: { appId: APP_ID } } as Credentials, {
        page: 1,
        limit: 10,
      }),
    ).rejects.toThrow(/appKey/)
    expect(get).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('collects the appId and appKey on the Connect page and stores them', async () => {
    const adapter = new LogicommerceAdapter(CFG)
    expect(adapter.credentialFields().map((f) => [f.name, f.type, f.required])).toEqual([
      ['appId', 'text', true],
      ['appKey', 'password', true],
    ])
    await expect(
      adapter.exchangeCredentials({ appId: ' hCN3fdW ', appKey: 'TcA1tG1V7q' }),
    ).resolves.toEqual({
      accessToken: 'TcA1tG1V7q',
      extra: { appId: 'hCN3fdW' },
    })
    await expect(adapter.exchangeCredentials({ appId: '', appKey: 'k' })).rejects.toThrow(/App ID/)
    await expect(adapter.exchangeCredentials({ appId: 'a', appKey: '' })).rejects.toThrow(/App key/)
  })

  it('has no OAuth flow', async () => {
    const adapter = new LogicommerceAdapter(CFG)
    expect(() => adapter.getAuthUrl('st')).toThrow(
      expect.objectContaining({ statusCode: 501, code: 'NOT_SUPPORTED' }),
    )
    await expect(adapter.exchangeCode('c', 'r')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
  })
})

describe('LogicommerceAdapter request shape', () => {
  it.each([
    ['listProducts', '/products', { page: 3, perPage: 25 }],
    ['listCollections', '/categories', { page: 3, perPage: 25 }],
    ['listLocations', '/physicalLocations', { page: 3, perPage: 25 }],
    ['listCustomers', '/accounts', { page: 3, perPage: 25 }],
    ['listOrders', '/orders', { page: 3, perPage: 25, statuses: '0,1,2,4,6,-1,-2,-11' }],
  ])('%s sends the caller’s page and exact limit to %s', async (method, path, expected) => {
    const { calls } = fake(() => ({}))
    await call(new LogicommerceAdapter(CFG), method, { page: 3, limit: 25 })
    expect(calls).toEqual([{ path, params: expected }])
  })

  it('listOrders asks for every documented order status, not the default Incoming only', async () => {
    const { calls } = fake(() => ({}))
    await call(new LogicommerceAdapter(CFG), 'listOrders', { page: 1, limit: 10 })
    expect(calls[0]!.params!.statuses).toBe('0,1,2,4,6,-1,-2,-11')
  })

  it('listCustomers sends updatedAfter as lastUsedFrom in the documented YYYY-MM-DDThh:mm:ssZ form', async () => {
    const { calls } = fake(() => ({}))
    await call(new LogicommerceAdapter(CFG), 'listCustomers', {
      page: 1,
      limit: 10,
      updatedAfter: new Date('2026-01-02T03:04:05.678Z'),
    })
    expect(calls).toEqual([
      { path: '/accounts', params: { page: 1, perPage: 10, lastUsedFrom: '2026-01-02T03:04:05Z' } },
    ])
  })

  it.each([
    ['getProduct', '5', '/products/5', 'product', ProductSchema],
    ['getCollection', '5', '/categories/5', 'category', CollectionSchema],
    ['getLocation', '5', '/physicalLocations/5', 'location', LocationSchema],
    ['getCustomer', '5', '/accounts/5', 'account', CustomerSchema],
    ['getOrder', '5', '/orders/5', 'order', OrderSchema],
  ])('%s reads %s from %s', async (method, id, path, fx, schema) => {
    const { calls } = fake(() => fixture(fx))
    const fn = (
      new LogicommerceAdapter(CFG) as unknown as Record<
        string,
        (c: Credentials, id: string) => Promise<unknown>
      >
    )[method]!
    const out = await fn.call(new LogicommerceAdapter(CFG), CREDS, id)
    expect(calls).toEqual([{ path, params: undefined }])
    schema.parse(out)
  })

  it('maps the documented list examples through each list method', async () => {
    const bodies: Record<string, unknown> = {
      '/products': fixture('products'),
      '/categories': fixture('categories'),
      '/physicalLocations': fixture('locations'),
      '/accounts': fixture('accounts'),
      '/orders': fixture('orders'),
    }
    fake((path) => bodies[path])
    const a = new LogicommerceAdapter(CFG)
    const p = { page: 1, limit: 100 }
    expect((await a.listProducts(CREDS, p)).map((r) => ProductSchema.parse(r).id)).toEqual(['1'])
    expect((await a.listCollections(CREDS, p)).map((r) => CollectionSchema.parse(r).id)).toEqual([
      '1',
    ])
    expect((await a.listLocations(CREDS, p)).map((r) => LocationSchema.parse(r).id)).toEqual(['1'])
    expect((await a.listCustomers(CREDS, p)).map((r) => CustomerSchema.parse(r).id)).toEqual([
      '123',
    ])
    expect((await a.listOrders(CREDS, p)).map((r) => OrderSchema.parse(r).id)).toEqual(['606'])
  })
})

describe('LogicommerceAdapter paging', () => {
  const L = 2
  const N = 2 * L + 1

  it.each([
    ['listProducts', '/products', 'PRODUCTS', product],
    ['listCollections', '/categories', 'CATEGORIES', category],
    ['listLocations', '/physicalLocations', 'PHYSICALLOCATIONS', location],
  ] as const)(
    '%s walks every row once and ends on an empty CURSORS.NEXT',
    async (method, path, key, make) => {
      const rows = Array.from({ length: N }, (_, i) => make(i + 1))
      const { calls } = fake((p, q) => (p === path ? cursorsBody(key, path, rows, q) : {}))
      const { ids, reports } = await walk(method, L, 3)
      expect(ids).toEqual(rows.map((r) => String(r.ID)))
      expect(reports.map((r) => r?.hasMore)).toEqual([true, true, false])
      expect(calls.map((c) => c.params)).toEqual([
        { page: 1, perPage: L },
        { page: 2, perPage: L },
        { page: 3, perPage: L },
      ])
    },
  )

  it('reports nothing when a response carries no CURSORS block', async () => {
    fake(() => ({ PRODUCTS: [product(1)] }))
    const params = withPageSink({ page: 1, limit: 10 })
    await call(new LogicommerceAdapter(CFG), 'listProducts', params)
    expect(readUpstreamPage(params)).toBeUndefined()
  })

  it('listCustomers walks every row once and ends on PAGINATION.TOTALITEMS', async () => {
    const rows = Array.from({ length: N }, (_, i) => account(i + 1))
    fake((_p, q) => {
      const s = slice(rows, q)
      return {
        ITEMS: s.rows,
        PAGINATION: {
          PAGE: s.page,
          PERPAGE: s.perPage,
          TOTALITEMS: rows.length,
          TOTALPAGES: Math.ceil(rows.length / s.perPage),
        },
      }
    })
    const { ids, reports } = await walk('listCustomers', L, 3)
    expect(ids).toEqual(rows.map((r) => String(r.ID)))
    expect(reports.map((r) => r?.hasMore)).toEqual([true, true, false])
    expect(reports.map((r) => r?.totalCount)).toEqual([N, N, N])
  })

  it('listCustomers ends on the last full page when the total is a multiple of the limit', async () => {
    const rows = Array.from({ length: 2 * L }, (_, i) => account(i + 1))
    fake((_p, q) => {
      const s = slice(rows, q)
      return {
        ITEMS: s.rows,
        PAGINATION: {
          PAGE: s.page,
          PERPAGE: s.perPage,
          TOTALITEMS: rows.length,
          TOTALPAGES: Math.ceil(rows.length / s.perPage),
        },
      }
    })
    const { ids, reports } = await walk('listCustomers', L, 2)
    expect(ids).toEqual(rows.map((r) => String(r.ID)))
    expect(reports.map((r) => r?.hasMore)).toEqual([true, false])
  })

  it('listOrders walks every row once by page and reports no end it was not told', async () => {
    const rows = Array.from({ length: N }, (_, i) => order(i + 1))
    fake((_p, q) => {
      const s = slice(rows, q)
      return {
        ITEMS: rows.length,
        ORDERS: s.rows,
        PAGERPARAMETERS: { PAGE: s.page, PERPAGE: s.perPage },
      }
    })
    const { ids, reports } = await walk('listOrders', L, 3)
    expect(ids).toEqual(rows.map((r) => String(r.ID)))
    expect(reports).toEqual([undefined, undefined, undefined])
  })

  it.each([
    ['listFulfillments', '/orders/77/shipments', 'SHIPMENTS'],
    ['listRefunds', '/orders/77/returns', 'returns'],
  ] as const)('%s pages the whole per-order list locally', async (method, path, key) => {
    const rows = Array.from({ length: N }, (_, i) => ({
      ID: i + 1,
      DATE: '2020-06-29T07:52:43+02:00',
    }))
    const { calls } = fake((p) => (p === path ? { [key]: rows } : {}))
    const { ids, reports } = await walk(method, L, 3, { order_id: '77' })
    expect(ids).toEqual(rows.map((r) => `77:${r.ID}`))
    expect(reports.map((r) => r?.hasMore)).toEqual([true, true, false])
    expect(reports.map((r) => r?.totalCount)).toEqual([N, N, N])
    expect(calls.every((c) => c.path === path && c.params === undefined)).toBe(true)
  })
})

describe('LogicommerceAdapter order-scoped reads', () => {
  it('getFulfillment reads the shipment back from its order', async () => {
    const { calls } = fake(() => fixture('order-shipments'))
    const out = await new LogicommerceAdapter(CFG).getFulfillment(CREDS, '1:108')
    expect(calls).toEqual([{ path: '/orders/1/shipments', params: undefined }])
    expect(FulfillmentSchema.parse(out)).toMatchObject({
      id: '1:108',
      orderId: '1',
      trackingNumber: 'TRK-123',
    })
  })

  it('getFulfillment is a 404 when the order has no such shipment', async () => {
    fake(() => fixture('order-shipments'))
    await expect(new LogicommerceAdapter(CFG).getFulfillment(CREDS, '1:999')).rejects.toMatchObject(
      {
        statusCode: 404,
      },
    )
  })

  it('getRefund reads the return back from its order', async () => {
    const { calls } = fake(() => fixture('order-returns'))
    const out = await new LogicommerceAdapter(CFG).getRefund(CREDS, '1:108')
    expect(calls).toEqual([{ path: '/orders/1/returns', params: undefined }])
    expect(RefundSchema.parse(out)).toMatchObject({ id: '1:108', orderId: '1' })
  })

  it('getRefund is a 404 when the order has no such return', async () => {
    fake(() => fixture('order-returns'))
    await expect(new LogicommerceAdapter(CFG).getRefund(CREDS, '1:999')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it.each([
    ['getFulfillment', '1:108:3'],
    ['getRefund', '1:108:3'],
    ['getFulfillment', '108'],
    ['getRefund', ':108'],
  ])('%s rejects the malformed id %s, sending nothing', async (method, id) => {
    const { get, create } = fake(() => ({}))
    const fn = (
      new LogicommerceAdapter(CFG) as unknown as Record<
        string,
        (c: Credentials, id: string) => Promise<unknown>
      >
    )[method]!
    await expect(fn.call(new LogicommerceAdapter(CFG), CREDS, id)).rejects.toThrow(
      /Invalid .* id format/,
    )
    expect(get).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it.each([
    ['listFulfillments', '/orders/77/shipments'],
    ['listRefunds', '/orders/77/returns'],
  ])('%s also takes the order as orderId', async (method, path) => {
    const { calls } = fake(() => ({}))
    await call(new LogicommerceAdapter(CFG), method, { page: 1, limit: 10, orderId: '77' })
    expect(calls).toEqual([{ path, params: undefined }])
  })

  it.each(['listFulfillments', 'listRefunds'])(
    '%s refuses without an order id, sending nothing',
    async (method) => {
      const { get, create } = fake(() => ({}))
      await expect(
        call(new LogicommerceAdapter(CFG), method, { page: 1, limit: 10 }),
      ).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
      })
      expect(get).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
    },
  )
})

describe('LogicommerceAdapter refusals', () => {
  it.each([
    ['listVariants', /cannot list variants/],
    ['listDiscounts', /cannot list discounts/],
    ['listInventoryLevels', /cannot list inventory levels/],
    ['listTransactions', /cannot list transactions/],
  ])('%s refuses with 501 before sending anything', async (method, message) => {
    const { get, create } = fake(() => ({}))
    const err = await call(new LogicommerceAdapter(CFG), method, { page: 1, limit: 10 }).catch(
      (e: unknown) => e,
    )
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect((err as Error).message).toMatch(message)
    expect(get).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it.each(['getVariant', 'getDiscount', 'getTransaction'])(
    '%s refuses with 501 before sending anything',
    async (method) => {
      const { get, create } = fake(() => ({}))
      const fn = (
        new LogicommerceAdapter(CFG) as unknown as Record<
          string,
          (c: Credentials, id: string) => Promise<unknown>
        >
      )[method]!
      await expect(fn.call(new LogicommerceAdapter(CFG), CREDS, '1')).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
      })
      expect(get).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
    },
  )
})

describe('LogicommerceAdapter write methods', () => {
  // The writes still target Shopify Admin REST paths on {shop}.myshopify.com.
  // They must refuse before building a client, or the API Sync appKey (the
  // connection's accessToken) would be sent to a Shopify host.
  const inv = { variantId: 'v', locationId: 'l', delta: 1, available: 1 }
  it.each([
    ['createProduct', [{ title: 'x' }]],
    ['updateProduct', ['1', { title: 'x' }]],
    ['deleteProduct', ['1']],
    ['updateVariant', ['1', { sku: 'x' }]],
    ['createCollection', [{ title: 'x' }]],
    ['updateCollection', ['1', { title: 'x' }]],
    ['deleteCollection', ['1']],
    ['adjustInventoryLevel', [inv]],
    ['setInventoryLevel', [inv]],
    ['createCustomer', [{ email: 'a@example.com' }]],
    ['updateCustomer', ['1', { email: 'a@example.com' }]],
    ['deleteCustomer', ['1']],
    ['createOrder', [{}]],
    ['updateOrder', ['1', {}]],
    ['cancelOrder', ['1']],
    ['createFulfillment', [{ orderId: '1' }]],
    ['updateFulfillment', ['1', {}]],
    ['cancelFulfillment', ['1']],
    ['createRefund', [{ orderId: '1' }]],
    ['createTransaction', [{ orderId: '1' }]],
    ['createDiscount', [{ code: 'X' }]],
    ['updateDiscount', ['1', {}]],
    ['deleteDiscount', ['1']],
  ] as const)('%s refuses with 501 and sends nothing', async (method, args) => {
    const { get, create } = fake(() => ({}))
    const adapter = new LogicommerceAdapter(CFG)
    const fn = (adapter as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[
      method
    ]!
    await expect(fn.call(adapter, CREDS, ...args)).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(get).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
})
