/**
 * VirtoCommerceAdapter request shape, pagination, and the "list works with
 * only { page, limit }" / "no fabricated values" guarantees.
 *
 * Verified against the live demo instance's Swagger (fetched 2026-09-13):
 * `ProductIndexedSearchCriteria`/`Result` (skip/take, items), `Shipment`/
 * `PaymentSearchCriteria` (orderId is an OPTIONAL filter field, not a
 * required param), `Price` (`GET /api/products/{id}/prices`, bare array).
 */
import { describe, it, expect, vi } from 'vitest'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import { VirtoCommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapters/virto-commerce/index'

const CREDS = { accessToken: 'test-key', extra: { platformUrl: 'https://vc.example.com' } }

function mockHttp(
  adapter: VirtoCommerceAdapter,
  handler: (method: string, path: string, arg2: unknown) => unknown,
) {
  const client = adapter['clientFor'](CREDS)
  const http = client['http']
  http.get = vi.fn(async (path: string, config?: { params?: unknown }) => ({
    data: handler('get', path, config?.params),
  })) as typeof http.get
  http.post = vi.fn(async (path: string, body?: unknown) => ({
    data: handler('post', path, body),
  })) as typeof http.post
  http.put = vi.fn(async (path: string, body?: unknown) => ({
    data: handler('put', path, body),
  })) as typeof http.put
  http.patch = vi.fn(async (path: string, body?: unknown) => ({
    data: handler('patch', path, body),
  })) as typeof http.patch
  ;(adapter as unknown as { clientFor: (c: unknown) => unknown })['clientFor'] = () => client
  return http
}

describe('VirtoCommerceAdapter — products', () => {
  it('listProducts works with only { page, limit } and POSTs the search endpoint', async () => {
    const adapter = new VirtoCommerceAdapter()
    const http = mockHttp(adapter, (method, path) => {
      expect(method).toBe('post')
      expect(path).toBe('/api/catalog/search/products')
      return { totalCount: 1, items: [{ id: 'p1', name: 'A' }] }
    })
    const params = withPageSink({ page: 1, limit: 20 })
    const products = await adapter.listProducts(CREDS, params)
    expect(products[0]!.id).toBe('p1')
    expect(http.post).toHaveBeenCalledWith('/api/catalog/search/products', { skip: 0, take: 20 })
    expect(readUpstreamPage(params)).toEqual({ hasMore: false, totalCount: 1 })
  })

  it('getVariant throws rather than fabricate a price when the platform reports none', async () => {
    const adapter = new VirtoCommerceAdapter()
    mockHttp(adapter, (method) => {
      if (method === 'get') return { id: 'v1', name: 'Black', mainProductId: 'p1' }
      return []
    })
    // getVariant issues two GETs (product, then prices) — route by call count.
    const client = adapter['clientFor'](CREDS)
    let call = 0
    client['http'].get = vi.fn(async (path: string) => {
      call += 1
      if (path === '/api/catalog/products/v1') return { data: { id: 'v1', name: 'Black', mainProductId: 'p1' } }
      return { data: [] } // no prices
    }) as typeof client['http']['get']
    ;(adapter as unknown as { clientFor: (c: unknown) => unknown })['clientFor'] = () => client

    await expect(adapter.getVariant!(CREDS, 'v1')).rejects.toThrow(/no price/)
    expect(call).toBe(2)
  })
})

describe('VirtoCommerceAdapter — variants (rule: lists work with only page/limit)', () => {
  it('listVariants without a productId does not throw — pages the catalog instead', async () => {
    const adapter = new VirtoCommerceAdapter()
    mockHttp(adapter, (method, path) => {
      expect(method).toBe('post')
      expect(path).toBe('/api/catalog/search/products')
      return { totalCount: 0, items: [] }
    })
    await expect(adapter.listVariants!(CREDS, { page: 1, limit: 20 })).resolves.toEqual([])
  })

  it('listVariants with a productId delegates to getProduct and returns its resolved variants', async () => {
    const adapter = new VirtoCommerceAdapter()
    const client = adapter['clientFor'](CREDS)
    client['http'].get = vi.fn(async (path: string) => {
      if (path === '/api/catalog/products/p1') {
        return {
          data: {
            id: 'p1',
            name: 'Product',
            variations: [{ id: 'v1', name: 'Black', mainProductId: 'p1' }],
          },
        }
      }
      return { data: [{ list: 19.99, currency: 'USD' }] }
    }) as typeof client['http']['get']
    ;(adapter as unknown as { clientFor: (c: unknown) => unknown })['clientFor'] = () => client

    const variants = await adapter.listVariants!(CREDS, { productId: 'p1' } as never)
    expect(variants).toHaveLength(1)
    expect(variants[0]!.price).toEqual({ amount: 1999, currency: 'USD' })
  })
})

describe('VirtoCommerceAdapter — fulfillments/transactions (rule: lists work with only page/limit)', () => {
  it('listFulfillments with only { page, limit } does not throw and omits orderId from the criteria', async () => {
    const adapter = new VirtoCommerceAdapter()
    const http = mockHttp(adapter, (_method, path, body) => {
      expect(path).toBe('/api/order/shipments/search')
      expect(body).toEqual({ orderId: undefined, skip: 0, take: 20 })
      return { totalCount: 0, results: [] }
    })
    await expect(adapter.listFulfillments!(CREDS, { page: 1, limit: 20 })).resolves.toEqual([])
    expect(http.post).toHaveBeenCalled()
  })

  it('listTransactions with only { page, limit } does not throw', async () => {
    const adapter = new VirtoCommerceAdapter()
    mockHttp(adapter, (_method, path) => {
      expect(path).toBe('/api/order/payments/search')
      return { totalCount: 0, results: [] }
    })
    await expect(adapter.listTransactions!(CREDS, { page: 1, limit: 20 })).resolves.toEqual([])
  })

  it('listTransactions with an order_id filter includes it in the search criteria', async () => {
    const adapter = new VirtoCommerceAdapter()
    const http = mockHttp(adapter, (_method, _path, body) => {
      expect(body).toMatchObject({ orderId: 'order-1' })
      return { totalCount: 0, results: [] }
    })
    await adapter.listTransactions!(CREDS, { order_id: 'order-1' } as never)
    expect(http.post).toHaveBeenCalled()
  })
})

describe('VirtoCommerceAdapter — orders', () => {
  it('cancelOrder PATCHes a JSON Patch replacing isCancelled/cancelReason, then re-fetches', async () => {
    const adapter = new VirtoCommerceAdapter()
    const http = mockHttp(adapter, (method, path, body) => {
      if (method === 'patch') {
        expect(path).toBe('/api/order/customerOrders/order-1')
        expect(body).toEqual([
          { op: 'replace', path: '/isCancelled', value: true },
          { op: 'replace', path: '/cancelReason', value: 'customer request' },
        ])
        return undefined
      }
      return { id: 'order-1', isCancelled: true }
    })
    const order = await adapter.cancelOrder!(CREDS, 'order-1', { reason: 'customer request' })
    expect(order.id).toBe('order-1')
    expect(http.patch).toHaveBeenCalled()
  })
})

describe('VirtoCommerceAdapter — inventory', () => {
  it('listInventoryLevels works with only { page, limit }', async () => {
    const adapter = new VirtoCommerceAdapter()
    mockHttp(adapter, (_method, path, body) => {
      expect(path).toBe('/api/inventory/search')
      expect(body).toEqual({ skip: 0, take: 20, productIds: undefined, fulfillmentCenterIds: undefined })
      return { totalCount: 0, results: [] }
    })
    await expect(adapter.listInventoryLevels(CREDS, { page: 1, limit: 20 })).resolves.toEqual([])
  })
})
