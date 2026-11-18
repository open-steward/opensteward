/**
 * OTTO Market pagination and request-shape tests.
 *
 * Pagination: every implemented list endpoint shares the hypermedia
 * envelope confirmed at https://api.otto.market/docs/about-the-api/api-guides
 * and re-confirmed per-family — `{ resources: [...], links: [{ rel, href }] }`
 * — where the sync worker's numeric `page` is resolved through the shared
 * cursor pager keyed on the `next` link's href (see client.ts `listPage`).
 *
 * Request shape: `Authorization: Bearer <token>` on every call (confirmed at
 * https://api.otto.market/docs/about-the-api/api-guides), and the documented
 * paths for availability writes
 * (https://api.otto.market/docs/functional-interfaces/availability) and
 * order cancellation (https://api.otto.market/docs/functional-interfaces/orders).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, _resetCursorPager } from '@opensteward/shared'
import { OttoMarketAdapter } from '../../../../../../src/verticals/ecommerce/adapters/otto-market/index'

const CREDS = { accessToken: 'tok', extra: { clientId: 'cid', environment: 'production' } }

interface Call {
  method: 'get' | 'post'
  pathOrHref: string
  params?: Record<string, unknown>
  body?: unknown
}

function fakeHttp(answer: (call: Call) => { resources?: unknown[]; links?: { rel: string; href: string }[] } | unknown) {
  const calls: Call[] = []
  const get = vi.fn(async (pathOrHref: string, cfg?: { params?: Record<string, unknown> }) => {
    const call: Call = { method: 'get', pathOrHref, params: cfg?.params }
    calls.push(call)
    return { data: answer(call) }
  })
  const post = vi.fn(async (path: string, body?: unknown) => {
    const call: Call = { method: 'post', pathOrHref: path, body }
    calls.push(call)
    return { data: answer(call) }
  })
  const createSpy = vi.spyOn(axios, 'create').mockReturnValue({ get, post } as never)
  return { calls, createSpy }
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('Bearer auth header', () => {
  it('every OttoMarketClient instance is created with Authorization: Bearer <token>', async () => {
    const { createSpy } = fakeHttp(() => ({ resources: [] }))
    await new OttoMarketAdapter().listOrders(CREDS, {})
    const cfg = createSpy.mock.calls.at(-1)?.[0] as { headers?: Record<string, string> } | undefined
    expect(cfg?.headers?.['Authorization']).toBe('Bearer tok')
  })
})

describe('orders: link-based pagination', () => {
  it('page 2 follows the `next` link href verbatim, with no cursor-param guessing', async () => {
    const { calls } = fakeHttp((call) => {
      if (call.pathOrHref === '/v4/orders') {
        return {
          resources: [{ salesOrderId: 'so-1', fulfillmentStatus: 'SENT', positionItems: [] }],
          links: [{ rel: 'next', href: '/v4/orders?nextcursor=abc' }],
        }
      }
      if (call.pathOrHref === '/v4/orders?nextcursor=abc') {
        return {
          resources: [{ salesOrderId: 'so-2', fulfillmentStatus: 'SENT', positionItems: [] }],
          links: [],
        }
      }
      throw new Error(`unexpected path ${call.pathOrHref}`)
    })
    const adapter = new OttoMarketAdapter()

    const p1params = withPageSink({ page: 1, limit: 10 })
    const p1 = await adapter.listOrders(CREDS, p1params)
    const p2params = withPageSink({ page: 2, limit: 10 })
    const p2 = await adapter.listOrders(CREDS, p2params)

    expect(p1.map((o) => o.id)).toEqual(['so-1'])
    expect(readUpstreamPage(p1params)?.hasMore).toBe(true)
    expect(p2.map((o) => o.id)).toEqual(['so-2'])
    expect(readUpstreamPage(p2params)?.hasMore).toBe(false)
    // Page 2 was fetched by requesting the href from page 1's response, not
    // by reconstructing a `nextcursor` query param.
    expect(calls[1]!.pathOrHref).toBe('/v4/orders?nextcursor=abc')
  })

  it('clamps the requested limit to the documented per-family default (128)', async () => {
    const { calls } = fakeHttp(() => ({ resources: [] }))
    await new OttoMarketAdapter().listOrders(CREDS, { page: 1, limit: 5000 })
    expect(calls[0]!.params).toMatchObject({ limit: 128 })
  })
})

describe('request shapes', () => {
  it('cancelOrder POSTs to /v4/orders/{id}/cancellation then re-fetches the order', async () => {
    const { calls } = fakeHttp((call) => {
      if (call.pathOrHref.endsWith('/cancellation')) return {}
      return { salesOrderId: 'so-1', fulfillmentStatus: 'CANCELLED_BY_PARTNER', positionItems: [] }
    })
    const order = await new OttoMarketAdapter().cancelOrder(CREDS, 'so-1', { reason: 'buyer request' })
    expect(calls[0]).toMatchObject({
      method: 'post',
      pathOrHref: '/v4/orders/so-1/cancellation',
      body: { reason: 'buyer request' },
    })
    expect(calls[1]).toMatchObject({ method: 'get', pathOrHref: '/v4/orders/so-1' })
    expect(order.id).toBe('so-1')
  })

  it('createFulfillment POSTs the shipment, then attaches line items by shipmentId', async () => {
    const { calls } = fakeHttp((call) => {
      if (call.pathOrHref === '/v1/shipments') return { shipmentId: 'ship-9', trackingKey: {} }
      return {}
    })
    await new OttoMarketAdapter().createFulfillment(CREDS, {
      orderId: 'so-1',
      carrier: 'DHL',
      trackingNumber: '999',
      lineItems: [{ lineItemId: 'pi-1', quantity: 1 }],
    })
    expect(calls[0]).toMatchObject({ method: 'post', pathOrHref: '/v1/shipments' })
    expect(calls[1]).toMatchObject({
      method: 'post',
      pathOrHref: '/v1/shipments/ship-9/positionitems',
      body: { positionItems: [{ positionItemId: 'pi-1', quantity: 1 }] },
    })
  })
})
