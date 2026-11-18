/**
 * Request-shape and pagination tests against mocked HTTP. Field/path shapes
 * are pinned to the raw OpenAPI fragments cited in each `transform/*.ts`
 * file and in `index.ts`'s per-method doc comments; this file additionally
 * pins:
 *   - the `X-API-KEY` header (every reference page's `securitySchemes`, e.g.
 *     https://idosell.readme.io/reference/productsproductsget)
 *   - canonical 1-indexed `{page, limit}` → IdoSell's 0-indexed
 *     `resultsPage`/`resultsLimit` (https://idosell.readme.io/reference/productscategoriesget:
 *     "Page with results number. Numeration starts from 0")
 *   - `style: form, explode: false` array query params being comma-joined,
 *     not repeated keys (verified on every id-batch parameter's OpenAPI
 *     fragment, e.g. `productIds` on productsproductsget)
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { IdosellAdapter } from '../../../../../../src/verticals/ecommerce/adapters/idosell/index'

const CREDS = { accessToken: 'key123', extra: { apiKey: 'key123', shopDomain: 'client123.idosell.com' } }

interface Call {
  method: string
  path: string
  arg?: unknown
}

function fakeHttp(answer: (call: Call) => unknown) {
  const calls: Call[] = []
  const record = (method: string) => (path: string, arg?: unknown) => {
    calls.push({ method, path, arg })
    return Promise.resolve({ data: answer({ method, path, arg }), headers: {} })
  }
  const http = {
    get: vi.fn((path: string, cfg?: { params?: unknown }) => {
      calls.push({ method: 'get', path, arg: cfg?.params })
      return Promise.resolve({ data: answer({ method: 'get', path, arg: cfg?.params }), headers: {} })
    }),
    post: vi.fn(record('post')),
    put: vi.fn(record('put')),
    delete: vi.fn((path: string, cfg?: { params?: unknown }) => {
      calls.push({ method: 'delete', path, arg: cfg?.params })
      return Promise.resolve({ data: answer({ method: 'delete', path, arg: cfg?.params }), headers: {} })
    }),
    defaults: { headers: {} as Record<string, unknown>, baseURL: '' },
  }
  vi.spyOn(axios, 'create').mockImplementation((cfg?: { headers?: Record<string, unknown>; baseURL?: string }) => {
    http.defaults.headers = cfg?.headers ?? {}
    http.defaults.baseURL = cfg?.baseURL ?? ''
    return http as never
  })
  return { calls, http }
}

afterEach(() => vi.restoreAllMocks())

describe('IdosellAdapter request shape', () => {
  it('sends X-API-KEY on the base client and hits the panel-domain base URL', async () => {
    const { http } = fakeHttp(() => ({ results: [] }))
    const adapter = new IdosellAdapter()
    await adapter.listProducts(CREDS, { page: 1, limit: 10 })
    expect(http.defaults.baseURL).toBe('https://client123.idosell.com/api/admin/v8')
    expect(http.defaults.headers['X-API-KEY']).toBe('key123')
  })

  it('converts canonical {page, limit} to 0-indexed resultsPage/resultsLimit on listProducts', async () => {
    const { calls } = fakeHttp(() => ({ results: [], resultsNumberAll: 0 }))
    const adapter = new IdosellAdapter()
    await adapter.listProducts(CREDS, { page: 3, limit: 25 })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.method).toBe('post')
    expect(calls[0]!.path).toBe('/products/products/search')
    expect(calls[0]!.arg).toMatchObject({ params: { resultsPage: 2, resultsLimit: 25 } })
  })

  it('clamps limit to the documented 1-100 ceiling', async () => {
    const { calls } = fakeHttp(() => ({ results: [] }))
    const adapter = new IdosellAdapter()
    await adapter.listProducts(CREDS, { page: 1, limit: 500 })
    expect(calls[0]!.arg).toMatchObject({ params: { resultsLimit: 100 } })
  })

  it('defaults page 1 to resultsPage 0 when page is omitted', async () => {
    const { calls } = fakeHttp(() => ({ results: [] }))
    const adapter = new IdosellAdapter()
    await adapter.listProducts(CREDS, {})
    expect(calls[0]!.arg).toMatchObject({ params: { resultsPage: 0 } })
  })

  it('getProduct sends a comma-joined productIds (style: form, explode: false), not repeated keys', async () => {
    const { calls } = fakeHttp(() => ({ results: [{ productId: 901, currencyId: 'PLN' }] }))
    const adapter = new IdosellAdapter()
    await adapter.getProduct(CREDS, '901')
    expect(calls[0]).toMatchObject({ method: 'get', path: '/products/products', arg: { productIds: '901' } })
  })

  it('listCollections pages GET /products/categories with resultsPage/resultsLimit query params', async () => {
    const { calls } = fakeHttp(() => ({ categories: [], resultsNumberAll: 0 }))
    const adapter = new IdosellAdapter()
    await adapter.listCollections(CREDS, { page: 2, limit: 50 })
    expect(calls[0]).toMatchObject({
      method: 'get',
      path: '/products/categories',
      arg: { resultsPage: 1, resultsLimit: 50 },
    })
  })

  it('listOrders posts to /orders/orders/search and reads the capitalised Results array', async () => {
    const { calls } = fakeHttp(() => ({ Results: [], resultsNumberAll: 0 }))
    const adapter = new IdosellAdapter()
    const out = await adapter.listOrders(CREDS, { page: 1, limit: 10 })
    expect(calls[0]!.path).toBe('/orders/orders/search')
    expect(out).toEqual([])
  })

  it('listRefunds uses snake_case results_page/results_limit — the one endpoint that differs', async () => {
    const { calls } = fakeHttp(() => ({ returns: [], results_number_all: 0 }))
    const adapter = new IdosellAdapter()
    await adapter.listRefunds(CREDS, { page: 2, limit: 10 })
    expect(calls[0]).toMatchObject({
      method: 'get',
      path: '/returns/returns',
      arg: { results_page: 1, results_limit: 10 },
    })
  })

  it('listInventoryLevels needs only {page, limit} — no location/product id is required', async () => {
    const { calls } = fakeHttp(() => ({
      results: [
        {
          productId: 901,
          currencyId: 'PLN',
          productStocksData: {
            productStocksQuantities: [
              { stockId: 1, productSizesData: [{ sizeId: 'M', productSizeQuantity: 5 }] },
            ],
          },
        },
      ],
      resultsNumberAll: 1,
    }))
    const adapter = new IdosellAdapter()
    const out = await adapter.listInventoryLevels!(CREDS, { page: 1, limit: 10 })
    expect(calls[0]!.path).toBe('/products/products/search')
    expect(out).toEqual([
      expect.objectContaining({ id: '901:M:1', variantId: '901:M', locationId: '1', available: 5 }),
    ])
  })

  it('deleteCustomer sends a real HTTP DELETE to /clients/remove with clientId', async () => {
    const { calls } = fakeHttp(() => ({ result: 'success' }))
    const adapter = new IdosellAdapter()
    await adapter.deleteCustomer!(CREDS, '88')
    expect(calls[0]).toMatchObject({ method: 'delete', path: '/clients/remove', arg: { clientId: 88 } })
  })

  it('cancelOrder writes the documented orderStatus value and re-fetches the order', async () => {
    const { calls } = fakeHttp((call) => {
      if (call.method === 'put') return {}
      return { Results: [{ orderId: 7001, orderDetails: { orderStatus: 'canceled' } }] }
    })
    const adapter = new IdosellAdapter()
    await adapter.cancelOrder!(CREDS, '7001')
    expect(calls[0]).toMatchObject({
      method: 'put',
      path: '/orders/orders',
      arg: { params: { orders: [{ orderId: '7001', orderStatus: 'canceled' }] } },
    })
    expect(calls[1]).toMatchObject({ method: 'get', path: '/orders/orders' })
  })
})
