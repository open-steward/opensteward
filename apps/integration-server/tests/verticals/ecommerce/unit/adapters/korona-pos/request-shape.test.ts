/**
 * Request-shape and pagination tests against mocked HTTP. Pins:
 *   - Basic auth header (`securitySchemes.basicAuth`, every path in
 *     https://128.koronacloud.com/web/api/v3/openapi.json)
 *   - 1-indexed `{page, limit}` passed straight through as `page`/`size`
 *     (both this platform and the canonical convention are 1-indexed —
 *     contrast IdoSell's 0-indexed `resultsPage`)
 *   - `PATCH` (never `PUT`) for single-resource updates, `POST` with an
 *     array body for batched creates, responding `AddOrUpdateResult[]`
 *   - `listInventoryLevels` needing only `{page, limit}` — no location or
 *     product id — verified against `/products/{productId}/stocks`
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { KoronaPosAdapter } from '../../../../../../src/verticals/ecommerce/adapters/korona-pos/index'

const CREDS = {
  accessToken: 'api-user',
  extra: { host: '128.koronacloud.com', koronaAccountId: 'acct-123', username: 'api-user', password: 'api-secret' },
}

interface Call {
  method: string
  path: string
  arg?: unknown
}

function fakeHttp(answer: (call: Call) => unknown) {
  const calls: Call[] = []
  const http = {
    get: vi.fn((path: string, cfg?: { params?: unknown }) => {
      calls.push({ method: 'get', path, arg: cfg?.params })
      return Promise.resolve({ data: answer({ method: 'get', path, arg: cfg?.params }) })
    }),
    post: vi.fn((path: string, body?: unknown) => {
      calls.push({ method: 'post', path, arg: body })
      return Promise.resolve({ data: answer({ method: 'post', path, arg: body }) })
    }),
    patch: vi.fn((path: string, body?: unknown) => {
      calls.push({ method: 'patch', path, arg: body })
      return Promise.resolve({ data: answer({ method: 'patch', path, arg: body }) })
    }),
    delete: vi.fn((path: string) => {
      calls.push({ method: 'delete', path })
      return Promise.resolve({ data: undefined })
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

describe('KoronaPosAdapter request shape', () => {
  it('sends Basic auth and hits the per-customer accounts base URL', async () => {
    const { http } = fakeHttp(() => ({ results: [], currentPage: 1, pagesTotal: 0, resultsOfPage: 0, resultsTotal: 0 }))
    const adapter = new KoronaPosAdapter()
    await adapter.listProducts(CREDS, { page: 1, limit: 10 })
    expect(http.defaults.baseURL).toBe('https://128.koronacloud.com/web/api/v3/accounts/acct-123')
    const expected = Buffer.from('api-user:api-secret').toString('base64')
    expect(http.defaults.headers['Authorization']).toBe(`Basic ${expected}`)
  })

  it('passes canonical {page, limit} straight through as page/size — both are 1-indexed', async () => {
    const { calls } = fakeHttp(() => ({ results: [], currentPage: 3, pagesTotal: 5, resultsOfPage: 0, resultsTotal: 100 }))
    const adapter = new KoronaPosAdapter()
    await adapter.listProducts(CREDS, { page: 3, limit: 25 })
    expect(calls[0]).toMatchObject({ method: 'get', path: '/products', arg: { page: 3, size: 25 } })
  })

  it('defaults page to 1 and size to the documented default when omitted', async () => {
    const { calls } = fakeHttp(() => ({ results: [], currentPage: 1, pagesTotal: 0, resultsOfPage: 0, resultsTotal: 0 }))
    const adapter = new KoronaPosAdapter()
    await adapter.listProducts(CREDS, {})
    expect(calls[0]).toMatchObject({ arg: { page: 1, size: 50 } })
  })

  it('does not clamp size to any ceiling — none is documented', async () => {
    const { calls } = fakeHttp(() => ({ results: [], currentPage: 1, pagesTotal: 0, resultsOfPage: 0, resultsTotal: 0 }))
    const adapter = new KoronaPosAdapter()
    await adapter.listProducts(CREDS, { limit: 5000 })
    expect(calls[0]).toMatchObject({ arg: { size: 5000 } })
  })

  it('updateProduct sends PATCH (never PUT) to /products/{id}, then re-fetches with GET', async () => {
    const { calls } = fakeHttp((call) => {
      if (call.method === 'patch') return undefined
      return { id: 'p1', name: 'Updated' }
    })
    const adapter = new KoronaPosAdapter()
    await adapter.updateProduct(CREDS, 'p1', { title: 'Updated' })
    expect(calls[0]).toMatchObject({ method: 'patch', path: '/products/p1', arg: { name: 'Updated' } })
    expect(calls[1]).toMatchObject({ method: 'get', path: '/products/p1' })
  })

  it('createProduct POSTs an array body and reads the id from AddOrUpdateResult[]', async () => {
    const { calls } = fakeHttp((call) => {
      if (call.method === 'post') return [{ status: 'OK', action: 'ADDED', id: 'new-id' }]
      return { id: 'new-id', name: 'New' }
    })
    const adapter = new KoronaPosAdapter()
    await adapter.createProduct(CREDS, { title: 'New' })
    expect(calls[0]).toMatchObject({ method: 'post', path: '/products', arg: [{ name: 'New' }] })
    expect(calls[1]).toMatchObject({ method: 'get', path: '/products/new-id' })
  })

  it('throws when the batch result has no OK status/id, rather than fetching an invented id', async () => {
    const { calls } = fakeHttp(() => [{ status: 'ERROR', message: 'boom' }])
    const adapter = new KoronaPosAdapter()
    await expect(adapter.createProduct(CREDS, { title: 'X' })).rejects.toThrow(/did not return an id/)
    expect(calls).toHaveLength(1)
  })

  it('deleteCollection sends a real HTTP DELETE to /commodityGroups/{id}', async () => {
    const { calls } = fakeHttp(() => undefined)
    const adapter = new KoronaPosAdapter()
    await adapter.deleteCollection!(CREDS, 'cg1')
    expect(calls[0]).toMatchObject({ method: 'delete', path: '/commodityGroups/cg1' })
  })

  it('listInventoryLevels needs only {page, limit} — pages products, then reads each one\'s stocks', async () => {
    const { calls } = fakeHttp((call) => {
      if (call.path === '/products') {
        return { results: [{ id: 'p1' }], currentPage: 1, pagesTotal: 1, resultsOfPage: 1, resultsTotal: 1 }
      }
      if (call.path === '/products/p1/stocks') {
        return {
          results: [{ amount: { actual: 5 }, product: { id: 'p1' }, warehouse: { id: 'w1' } }],
          currentPage: 1,
          pagesTotal: 1,
          resultsOfPage: 1,
          resultsTotal: 1,
        }
      }
      throw new Error('unexpected ' + call.path)
    })
    const adapter = new KoronaPosAdapter()
    const out = await adapter.listInventoryLevels!(CREDS, { page: 1, limit: 10 })
    expect(calls.map((c) => c.path)).toEqual(['/products', '/products/p1/stocks'])
    expect(out).toEqual([expect.objectContaining({ id: 'p1:w1', available: 5 })])
  })

  it('adjustInventoryLevel creates a stock adjustment, posts the relative delta, then books it', async () => {
    const { calls } = fakeHttp((call) => {
      if (call.path === '/stockAdjustments') return [{ status: 'OK', action: 'ADDED', id: 'adj1' }]
      if (call.path === '/stockAdjustments/adj1/items') return [{ status: 'OK', action: 'ADDED' }]
      if (call.path === '/stockAdjustments/adj1/book') return undefined
      if (call.path === '/products/p1/stocks') {
        return {
          results: [{ amount: { actual: 15 }, product: { id: 'p1' }, warehouse: { id: 'w1' } }],
          currentPage: 1,
          pagesTotal: 1,
          resultsOfPage: 1,
          resultsTotal: 1,
        }
      }
      throw new Error('unexpected ' + call.path)
    })
    const adapter = new KoronaPosAdapter()
    const result = await adapter.adjustInventoryLevel!(CREDS, { variantId: 'p1', locationId: 'w1', delta: 5 })
    expect(calls[0]).toMatchObject({ method: 'post', path: '/stockAdjustments', arg: [{ warehouse: { id: 'w1' } }] })
    expect(calls[1]).toMatchObject({
      method: 'post',
      path: '/stockAdjustments/adj1/items',
      arg: [{ product: { id: 'p1' }, amount: 5 }],
    })
    expect(calls[2]).toMatchObject({ method: 'patch', path: '/stockAdjustments/adj1/book' })
    expect(result.available).toBe(15)
  })

  it('listTransactions resolves the system currency once, then applies it to every receipt', async () => {
    const { calls } = fakeHttp((call) => {
      if (call.path === '/currencies') {
        return {
          results: [{ key: 'usd', systemCurrency: true }, { key: 'eur', systemCurrency: false }],
          currentPage: 1,
          pagesTotal: 1,
          resultsOfPage: 2,
          resultsTotal: 2,
        }
      }
      if (call.path === '/receipts') {
        return {
          results: [{ id: 'r1', total: { gross: 10 } }],
          currentPage: 1,
          pagesTotal: 1,
          resultsOfPage: 1,
          resultsTotal: 1,
        }
      }
      throw new Error('unexpected ' + call.path)
    })
    const adapter = new KoronaPosAdapter()
    const out = await adapter.listTransactions!(CREDS, { page: 1, limit: 10 })
    expect(calls.map((c) => c.path)).toEqual(['/currencies', '/receipts'])
    expect(out[0]!.amount).toEqual({ amount: 1000, currency: 'USD' })
  })
})
