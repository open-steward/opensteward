/**
 * SendowlAdapter request shape + pagination reporting.
 *
 * Verified against https://dashboard.sendowl.com/developers/api/products,
 * .../discounts and .../orders (2026-09-13). Each list request is asserted
 * for method + path + params; `reportUpstreamPage` is asserted against the
 * `hasMore` heuristic (SendOwl reports no total).
 */
import { describe, it, expect, vi } from 'vitest'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import { SendowlAdapter } from '../../../../../../src/verticals/ecommerce/adapters/sendowl/index'

const CREDS = { accessToken: 'test-key', extra: { apiSecret: 'test-secret' } }

function mockHttp(adapter: SendowlAdapter, handler: (method: string, path: string, arg2: unknown) => unknown) {
  const client = adapter['clientFor'](CREDS)
  const http = client['http']
  http.get = vi.fn(async (path: string, config?: { params?: unknown }) => ({
    data: handler('get', path, config?.params),
    headers: {},
  })) as typeof http.get
  http.post = vi.fn(async (path: string, body?: unknown) => ({
    data: handler('post', path, body),
    headers: {},
  })) as typeof http.post
  http.put = vi.fn(async (path: string, body?: unknown) => ({
    data: handler('put', path, body),
    headers: {},
  })) as typeof http.put
  // Overwrite the private per-call client factory so every adapter method
  // under test reuses this one mocked axios instance.
  ;(adapter as unknown as { clientFor: (c: unknown) => unknown })['clientFor'] = () => client
  return http
}

describe('SendowlAdapter — products', () => {
  it('listProducts GETs /api/v1/products with page/per_page and unwraps the product wrapper', async () => {
    const adapter = new SendowlAdapter()
    const http = mockHttp(adapter, (method, path) => {
      expect(method).toBe('get')
      expect(path).toBe('/api/v1/products')
      return [{ product: { id: 1, name: 'A' } }]
    })
    const params = withPageSink({ page: 2, limit: 10 })
    const products = await adapter.listProducts!(CREDS, params)
    expect(products[0]!.id).toBe('1')
    expect(http.get).toHaveBeenCalledWith(
      '/api/v1/products',
      { params: { per_page: 10, page: 2 } },
    )
    expect(readUpstreamPage(params)).toEqual({ hasMore: false })
  })

  it('getProduct GETs /api/v1/products/{id}', async () => {
    const adapter = new SendowlAdapter()
    mockHttp(adapter, (_method, path) => {
      expect(path).toBe('/api/v1/products/42')
      return { product: { id: 42, name: 'A' } }
    })
    const product = await adapter.getProduct!(CREDS, '42')
    expect(product.id).toBe('42')
  })

  it('createProduct POSTs to /api/v1/products with a product-keyed body', async () => {
    const adapter = new SendowlAdapter()
    const http = mockHttp(adapter, () => ({ product: { id: 1, name: 'New' } }))
    await adapter.createProduct!(CREDS, { title: 'New' })
    expect(http.post).toHaveBeenCalledWith('/api/v1/products', { product: { name: 'New' } })
  })
})

describe('SendowlAdapter — discounts', () => {
  it('listDiscounts GETs /api/v1_2/discounts', async () => {
    const adapter = new SendowlAdapter()
    mockHttp(adapter, (_method, path) => {
      expect(path).toBe('/api/v1_2/discounts')
      return [{ discount: { id: 3, name: '10% off', percentage_discount: '10.0' } }]
    })
    const discounts = await adapter.listDiscounts!(CREDS, withPageSink({}))
    expect(discounts[0]!.id).toBe('3')
  })
})

describe('SendowlAdapter — orders', () => {
  it('listOrders GETs /api/v1_3/orders', async () => {
    const adapter = new SendowlAdapter()
    mockHttp(adapter, (_method, path) => {
      expect(path).toBe('/api/v1_3/orders')
      return [{ order: { id: 3101, state: 'complete' } }]
    })
    const orders = await adapter.listOrders!(CREDS, withPageSink({}))
    expect(orders[0]!.id).toBe('3101')
  })

  it('getOrder GETs /api/v1_3/orders/{id}', async () => {
    const adapter = new SendowlAdapter()
    mockHttp(adapter, (_method, path) => {
      expect(path).toBe('/api/v1_3/orders/3101')
      return { order: { id: 3101, state: 'complete' } }
    })
    const order = await adapter.getOrder!(CREDS, '3101')
    expect(order.id).toBe('3101')
  })
})

describe('SendowlAdapter — refunds', () => {
  it('listRefunds scoped to an order_id reads that order embedded refund_transactions', async () => {
    const adapter = new SendowlAdapter()
    mockHttp(adapter, (_method, path) => {
      expect(path).toBe('/api/v1_3/orders/3101')
      return {
        order: {
          id: 3101,
          state: 'complete',
          refunded: true,
          refund_transactions: [
            { refund_transaction: { amount: '-3.00', currency: 'GBP', occurred_at: '2011-05-20T09:30:00Z' } },
          ],
        },
      }
    })
    const refunds = await adapter.listRefunds!(CREDS, { order_id: '3101' })
    expect(refunds).toHaveLength(1)
    expect(refunds[0]!.id).toBe('3101:0')
  })

  it('listRefunds with only {page, limit} pages through orders and flattens their refunds', async () => {
    const adapter = new SendowlAdapter()
    mockHttp(adapter, (_method, path) => {
      expect(path).toBe('/api/v1_3/orders')
      return [
        {
          order: {
            id: 3101,
            state: 'complete',
            refund_transactions: [
              { refund_transaction: { amount: '-3.00', currency: 'GBP', occurred_at: '2011-05-20T09:30:00Z' } },
            ],
          },
        },
        { order: { id: 3102, state: 'complete', refund_transactions: [] } },
      ]
    })
    const refunds = await adapter.listRefunds!(CREDS, { page: 1, limit: 10 })
    expect(refunds).toEqual([expect.objectContaining({ id: '3101:0' })])
  })

  it('createRefund POSTs to /api/v1/orders/{id}/refund with a decimal amount', async () => {
    const adapter = new SendowlAdapter()
    const http = mockHttp(adapter, (method, path, body) => {
      if (method === 'post') {
        expect(path).toBe('/api/v1/orders/3101/refund')
        expect(body).toEqual({ amount: '3.00' })
        return {}
      }
      // Re-fetch after refund to read back the synthesized refund.
      return {
        order: {
          id: 3101,
          state: 'complete',
          refunded: true,
          refund_transactions: [
            { refund_transaction: { amount: '-3.00', currency: 'GBP', occurred_at: '2011-05-20T09:30:00Z' } },
          ],
        },
      }
    })
    const refund = await adapter.createRefund!(CREDS, {
      orderId: '3101',
      amount: { amount: 300, currency: 'GBP' },
    })
    expect(refund.id).toBe('3101:0')
    expect(http.post).toHaveBeenCalledWith('/api/v1/orders/3101/refund', { amount: '3.00' })
  })
})
