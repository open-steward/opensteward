/**
 * GOFRUGAL pagination + createOrder tests.
 *
 * `GET /items` documents no pagination at all — the adapter paginates the
 * full item list client-side. `GET /salesOrders` documents `page`/`limit`
 * (server-side), so those two are exercised differently here. Docs:
 * https://community.gofrugal.com/portal/en/kb/gofrugalretaileasy/ecommerce-integration/api-integration/articles/list-all-items
 * and .../articles/list-all-sales-orders.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { GofrugalAdapter } from '../../../../../../src/verticals/ecommerce/adapters/gofrugal/index'
import type { Order } from '../../../../../../src/verticals/ecommerce/schema/order'

const CREDS = {
  accessToken: 'gf-key',
  extra: { apiKey: 'gf-key', baseUrl: 'https://retaileasy.example.com/WebReporter/api/v1', currency: 'INR' },
}

function fakeGofrugal(handlers: Record<string, (params: Record<string, unknown>) => unknown>) {
  const calls: { path: string; params: Record<string, unknown> }[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = cfg?.params ?? {}
    calls.push({ path, params })
    if (!handlers[path]) throw new Error(`unexpected GET path in test: ${path}`)
    return { data: handlers[path]!(params) }
  })
  const post = vi.fn()
  vi.spyOn(axios, 'create').mockReturnValue({ get, post, defaults: {} } as never)
  return { calls, get, post }
}

afterEach(() => {
  vi.restoreAllMocks()
})

function item(itemId: number) {
  return { itemId, itemName: `item-${itemId}`, locationId: 1, stock: [{ stock: 1, salePrice: 10 }] }
}

describe('GOFRUGAL pagination — client-paginated (products/inventory over GET /items)', () => {
  it('listProducts paginates the full, unpaginated item list client-side and reports honestly', async () => {
    fakeGofrugal({ '/items': () => ({ items: [item(1), item(2), item(3)] }) })
    const adapter = new GofrugalAdapter()
    const params = withPageSink({ page: 1, limit: 2 } as QueryParams)
    const products = await adapter.listProducts!(CREDS, params)
    expect(products.map((p) => p.id)).toEqual(['1', '2'])
    expect(readUpstreamPage(params)).toEqual({ hasMore: true, totalCount: 3, pagedLocally: true })
  })

  it('listInventoryLevels paginates the same item list and reports hasMore: false on the last page', async () => {
    fakeGofrugal({ '/items': () => ({ items: [item(1), item(2), item(3)] }) })
    const adapter = new GofrugalAdapter()
    const params = withPageSink({ page: 2, limit: 2 } as QueryParams)
    const levels = await adapter.listInventoryLevels!(CREDS, params)
    expect(levels.map((l) => l.variantId)).toEqual(['3:default'])
    expect(readUpstreamPage(params)).toEqual({ hasMore: false, totalCount: 3, pagedLocally: true })
  })

  it('works with only {page, limit} — no extra params required', async () => {
    fakeGofrugal({ '/items': () => ({ items: [item(1)] }) })
    const adapter = new GofrugalAdapter()
    const products = await adapter.listProducts!(CREDS, { page: 1, limit: 10 } as QueryParams)
    expect(products).toHaveLength(1)
  })
})

describe('GOFRUGAL pagination — server-paginated (orders over GET /salesOrders)', () => {
  it('sends page/limit and does not guess hasMore (undocumented in the list response)', async () => {
    const { calls } = fakeGofrugal({
      '/salesOrders': () => ({
        salesOrders: [{ onlineReferenceNo: 1, currency: 'INR', status: 'pending' }],
      }),
    })
    const adapter = new GofrugalAdapter()
    const params = withPageSink({ page: 1, limit: 50 } as QueryParams)
    const orders = await adapter.listOrders!(CREDS, params)
    expect(orders.map((o) => o.id)).toEqual(['1'])
    expect(calls[0]!.params).toEqual({ page: 1, limit: 50 })
    expect(readUpstreamPage(params)).toEqual({ currentPage: 1 })
  })

  it('clamps the requested limit to the documented 250-row maximum', async () => {
    const { calls } = fakeGofrugal({ '/salesOrders': () => ({ salesOrders: [] }) })
    const adapter = new GofrugalAdapter()
    await adapter.listOrders!(CREDS, { page: 1, limit: 9_999 } as QueryParams)
    expect(calls[0]!.params['limit']).toBe(adapter.capabilities!.maxPageSize)
  })

  it('works with only {page, limit} — updatedAfter is optional', async () => {
    const { calls } = fakeGofrugal({ '/salesOrders': () => ({ salesOrders: [] }) })
    const adapter = new GofrugalAdapter()
    await adapter.listOrders!(CREDS, { page: 1, limit: 50 } as QueryParams)
    expect(calls[0]!.params).toEqual({ page: 1, limit: 50 })
  })

  it('forwards the caller page to the documented `page` parameter (pages 2 and 3)', async () => {
    const { calls } = fakeGofrugal({ '/salesOrders': () => ({ salesOrders: [] }) })
    const adapter = new GofrugalAdapter()
    await adapter.listOrders!(CREDS, { page: 2, limit: 7 } as QueryParams)
    await adapter.listOrders!(CREDS, { page: 3, limit: 7 } as QueryParams)
    expect(calls.map((c) => c.params)).toEqual([
      { page: 2, limit: 7 },
      { page: 3, limit: 7 },
    ])
  })
})

describe('GOFRUGAL createOrder', () => {
  const validOrder: Partial<Order> = {
    customerId: '1',
    email: 'customer@example.com',
    phone: '9000000000',
    billingAddress: { postalCode: '600042' },
    shippingAddress: { line1: '1 Example Street', region: 'Tamil Nadu', country: 'IN', postalCode: '600042' },
    lineItems: [{ id: 'row-1', productId: '1', title: 'lux', quantity: 10, price: { amount: 1000, currency: 'INR' }, sku: 'LUX-001', metadata: {} }],
    metadata: {
      customerName: 'Test Customer',
      shippingId: '1',
      shippingName: 'Test Customer',
      deliveryDate: '2013-11-22 13:00:00',
    },
  }

  it('creates a sales order and re-fetches it by the returned id', async () => {
    const { post } = fakeGofrugal({
      '/salesOrders/1': () => ({ salesOrder: { onlineReferenceNo: 1, currency: 'INR' } }),
    })
    post.mockResolvedValue({ data: { result: { status: 'Success', id: 1 } } })
    const adapter = new GofrugalAdapter()
    const order = await adapter.createOrder!(CREDS, validOrder)
    expect(order.id).toBe('1')
    expect(post).toHaveBeenCalledWith('/salesOrders', { salesOrder: expect.objectContaining({ customerId: '1' }) })
  })

  it('throws when GOFRUGAL reports an error result instead of guessing success', async () => {
    const { post } = fakeGofrugal({})
    post.mockResolvedValue({ data: { result: { status: 'Error', id: 0, Message: 'Duplicate order' } } })
    const adapter = new GofrugalAdapter()
    await expect(adapter.createOrder!(CREDS, validOrder)).rejects.toThrow(/Duplicate order/)
  })

  it('rejects a create request missing mandatory upstream fields instead of sending them blank', async () => {
    const adapter = new GofrugalAdapter()
    await expect(adapter.createOrder!(CREDS, { customerId: '1' })).rejects.toThrow(
      /missing mandatory field/,
    )
  })
})
