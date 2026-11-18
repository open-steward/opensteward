/**
 * ePages Beyond HTTP request shape (method, path, headers, body) and
 * page/limit → page/size pagination.
 * Docs: https://api-docs.beyondshop.cloud/index-api-basics.html#pagination
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import { EpagesAdapter } from '../../../../../../src/verticals/ecommerce/adapters/epages/index'

const CREDS = { accessToken: 'jwt', extra: { shop: 'myshop', clientId: 'cid', clientSecret: 'sec' } }

function fakeEpages(answer: (path: string, params?: Record<string, unknown>) => unknown) {
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => ({
    data: answer(path, cfg?.params),
  }))
  const post = vi.fn(async (path: string, body?: unknown) => ({ data: answer(path, body as never) }))
  const put = vi.fn(async (path: string, body?: unknown) => ({ data: answer(path, body as never) }))
  const patch = vi.fn(async (path: string, body?: unknown) => ({ data: answer(path, body as never) }))
  const del = vi.fn(async () => ({ data: {} }))
  vi.spyOn(axios, 'create').mockReturnValue({ get, post, put, patch, delete: del } as never)
  return { get, post, put, patch, delete: del }
}

afterEach(() => vi.restoreAllMocks())

describe('client construction', () => {
  it('sends the Bearer token and hal+json headers against the shop-specific host', async () => {
    fakeEpages(() => ({ _embedded: { products: [] } }))
    const adapter = new EpagesAdapter()
    await adapter.listProducts(CREDS, {})
    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://myshop.beyondshop.cloud/api',
        headers: expect.objectContaining({
          Authorization: 'Bearer jwt',
          Accept: 'application/hal+json',
        }),
      }),
    )
  })

  it('throws without a shop in credentials.extra', async () => {
    fakeEpages(() => ({}))
    const adapter = new EpagesAdapter()
    await expect(adapter.listProducts({ accessToken: 'jwt' }, {})).rejects.toThrow(/missing `shop`/)
  })
})

describe('products', () => {
  it('listProducts sends 0-indexed page + size and reports the confirmed total', async () => {
    const { get } = fakeEpages(() => ({
      _embedded: { products: [{ _id: 'p1', name: 'X', salesPrice: { amount: 1, currency: 'EUR' } }] },
      page: { size: 20, totalElements: 42, totalPages: 3, number: 1 },
    }))
    const adapter = new EpagesAdapter()
    const params = withPageSink({ page: 2, limit: 20 })
    const result = await adapter.listProducts(CREDS, params)
    expect(get).toHaveBeenCalledWith('products', { params: { page: 1, size: 20 } })
    expect(result).toHaveLength(1)
    expect(readUpstreamPage(params)).toEqual({ totalCount: 42, totalPages: 3 })
  })

  it('createProduct POSTs the untransformed body to products', async () => {
    const { post } = fakeEpages((path) => ({
      _id: 'p1',
      name: 'New',
      salesPrice: { amount: 5, currency: 'EUR' },
      __path: path,
    }))
    const adapter = new EpagesAdapter()
    await adapter.createProduct(CREDS, {
      title: 'New',
      variants: [{ id: 'v', price: { amount: 500, currency: 'EUR' }, metadata: {} }],
    })
    expect(post).toHaveBeenCalledWith('products', expect.objectContaining({ name: 'New' }))
  })

  it('deleteProduct DELETEs products/:id', async () => {
    const { delete: del } = fakeEpages(() => ({}))
    const adapter = new EpagesAdapter()
    await adapter.deleteProduct(CREDS, 'p1')
    expect(del).toHaveBeenCalledWith('products/p1')
  })
})

describe('variants', () => {
  it('listVariants requires productId', async () => {
    fakeEpages(() => ({}))
    const adapter = new EpagesAdapter()
    await expect(adapter.listVariants(CREDS, {})).rejects.toThrow(/requires \?productId=/)
  })

  it('getVariant splits the composite id', async () => {
    const { get } = fakeEpages(() => ({
      _id: 'v1',
      salesPrice: { amount: 1, currency: 'EUR' },
    }))
    const adapter = new EpagesAdapter()
    await adapter.getVariant(CREDS, 'p1:v1')
    expect(get).toHaveBeenCalledWith('products/p1/variations/v1', { params: undefined })
  })
})

describe('orders', () => {
  it('cancelOrder POSTs orders/:id/cancel then re-fetches', async () => {
    let getCalls = 0
    const { post, get } = fakeEpages((path) => {
      if (path === 'orders/o1') {
        getCalls += 1
        return { _id: 'o1', productLineItems: [] }
      }
      return {}
    })
    const adapter = new EpagesAdapter()
    await adapter.cancelOrder(CREDS, 'o1')
    expect(post).toHaveBeenCalledWith('orders/o1/cancel', undefined)
    expect(get).toHaveBeenCalledWith('orders/o1', { params: undefined })
    expect(getCalls).toBe(1)
  })
})

describe('discounts', () => {
  it('createDiscount POSTs to coupon-campaigns', async () => {
    const { post } = fakeEpages(() => ({ _id: 'c1', name: 'X' }))
    const adapter = new EpagesAdapter()
    await adapter.createDiscount(CREDS, { title: 'X', value: 10 })
    expect(post).toHaveBeenCalledWith(
      'coupon-campaigns',
      expect.objectContaining({ name: 'X' }),
    )
  })

  it('deleteDiscount DELETEs coupon-campaigns/:id', async () => {
    const { delete: del } = fakeEpages(() => ({}))
    const adapter = new EpagesAdapter()
    await adapter.deleteDiscount(CREDS, 'c1')
    expect(del).toHaveBeenCalledWith('coupon-campaigns/c1')
  })
})
