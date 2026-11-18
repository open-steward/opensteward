/**
 * Routific order reads against the documented Platform API v2.
 *
 * - Host and auth (https://api-docs.routific.com/reference/routific-projects-api.md):
 *   "In your request headers make sure to include`Authorization: Bearer
 *   YOUR_API_KEY` and `Content-Type: application/json`."
 * - getOrder (https://api-docs.routific.com/reference/fetch-order.md):
 *   GET https://api.plan.routific.com/v2/orders/{orderUuid}.
 * - listOrders: the docs index (https://api-docs.routific.com/llms.txt) lists
 *   Create orders, Fetch order, Fetch photos, Update order, Update order
 *   completion, Delete single order, Delete multiple orders and Fetch order
 *   action status, and no order-list endpoint. "A GET request to the `/orders`
 *   endpoint allows you to query the current details of an order" is the
 *   single-record read, so the list is refused before any request.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { RoutificAdapter } from '../../../../../../src/verticals/logistics/adapters/routific/index'
import { OrderSchema } from '../../../../../../src/verticals/logistics/schema/order'
import { documentedOrder } from './fixtures'

const CREDS = { accessToken: 'rtf_token' }

function spyHttp(getImpl: (path: string, cfg?: unknown) => unknown = () => ({})) {
  const get = vi.fn(async (path: string, cfg?: unknown) => ({ data: getImpl(path, cfg) }))
  const post = vi.fn()
  const put = vi.fn()
  const create = vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post,
    put,
    delete: vi.fn(),
    defaults: { headers: { common: {} } },
  } as never)
  const blocked = () => Promise.reject(new Error('network blocked in test'))
  const request = vi.spyOn(axios, 'request').mockImplementation(blocked)
  const directGet = vi.spyOn(axios, 'get').mockImplementation(blocked)
  return { create, get, post, put, request, directGet }
}

afterEach(() => vi.restoreAllMocks())

describe('Routific listOrders', () => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const h = spyHttp()
    await expect(
      new RoutificAdapter().listOrders!(CREDS, { page: 1, limit: 10 }),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(/^Routific cannot list orders/),
    })
    expect(h.create).not.toHaveBeenCalled()
    expect(h.get).not.toHaveBeenCalled()
    expect(h.request).not.toHaveBeenCalled()
    expect(h.directGet).not.toHaveBeenCalled()
  })
})

describe('Routific getOrder', () => {
  it('calls GET /v2/orders/{orderUuid} on api.plan.routific.com with the bearer token', async () => {
    const h = spyHttp(() => documentedOrder())
    await new RoutificAdapter().getOrder!(CREDS, '9a3e5d87-a448-4125-a165-2b8a689322ab')

    expect(h.create).toHaveBeenCalledTimes(1)
    const cfg = h.create.mock.calls[0]![0] as { baseURL: string; headers: Record<string, string> }
    expect(cfg.baseURL).toBe('https://api.plan.routific.com/v2/')
    expect(cfg.headers.Authorization).toBe('Bearer rtf_token')
    expect(cfg.headers['Content-Type']).toBe('application/json')

    expect(h.get).toHaveBeenCalledTimes(1)
    expect(h.get.mock.calls[0]![0]).toBe('orders/9a3e5d87-a448-4125-a165-2b8a689322ab')
    // Fetch order documents no query parameters.
    expect((h.get.mock.calls[0]![1] as { params?: unknown } | undefined)?.params).toBeUndefined()
  })

  it('encodes the id into the path', async () => {
    const h = spyHttp(() => documentedOrder())
    await new RoutificAdapter().getOrder!(CREDS, 'a/b?c')
    expect(h.get.mock.calls[0]![0]).toBe('orders/a%2Fb%3Fc')
  })

  it('returns the documented order parsed by OrderSchema', async () => {
    spyHttp(() => documentedOrder({ status: 'scheduled' }))
    const out = OrderSchema.parse(
      await new RoutificAdapter().getOrder!(CREDS, '9a3e5d87-a448-4125-a165-2b8a689322ab'),
    )
    expect(out.id).toBe('9a3e5d87-a448-4125-a165-2b8a689322ab')
    expect(out.status).toBe('AWAITING_SHIPMENT')
    expect(out.orderNumber).toBe('ORD-1655')
  })
})
