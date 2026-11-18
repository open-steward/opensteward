/**
 * Glovo order/shipment reads: refused with 501 NOT_SUPPORTED before any request.
 *
 * The adapter talks to the Glovo Partners API (api.glovoapp.com, `Authorization:
 * <token>`). Its OpenAPI spec, https://api-docs.glovoapp.com/partners/definition.yaml
 * (the file the Redoc page at /partners/index.html loads), documents the
 * `/api/v0/integrations/orders/...` family only as four PUT actions on one order:
 *
 *   /api/v0/integrations/orders/{orderId}/accept:
 *   /api/v0/integrations/orders/{orderId}/ready_for_pickup:
 *   /api/v0/integrations/orders/{orderId}/out_for_delivery:
 *   /api/v0/integrations/orders/{orderId}/customer_picked_up:
 *
 * It has no GET on `/api/v0/integrations/orders` (the list the adapter used to
 * call) and no GET on `/api/v0/integrations/orders/{orderId}` (the read it used
 * for getOrder/getShipment). Orders reach the partner by push instead.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink } from '@opensteward/shared'
import { GlovoAdapter } from '../../../../../../src/verticals/logistics/adapters/glovo/index'

const CREDS = { accessToken: 'glovo-token' }

describe('glovo order/shipment reads are refused before any request', () => {
  const request = vi.fn()
  const get = vi.fn()
  const post = vi.fn()
  const put = vi.fn()

  beforeEach(() => {
    vi.spyOn(axios, 'create').mockReturnValue({
      request,
      get,
      post,
      put,
      defaults: { headers: {} },
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    } as unknown as ReturnType<typeof axios.create>)
    vi.spyOn(axios, 'get').mockImplementation(get)
    vi.spyOn(axios, 'request').mockImplementation(request)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    request.mockReset()
    get.mockReset()
    post.mockReset()
    put.mockReset()
  })

  function expectNoRequest() {
    expect(request).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
  }

  const cases: Array<[string, (a: GlovoAdapter) => Promise<unknown>, RegExp]> = [
    [
      'listOrders',
      (a) => a.listOrders(CREDS, withPageSink({ page: 1, limit: 5 })),
      /Glovo cannot list orders/,
    ],
    [
      'listShipments',
      (a) => a.listShipments(CREDS, withPageSink({ page: 1, limit: 5 })),
      /Glovo cannot list shipments/,
    ],
    ['getOrder', (a) => a.getOrder(CREDS, 'GLV-1'), /Glovo cannot read an order/],
    ['getShipment', (a) => a.getShipment(CREDS, 'GLV-1'), /Glovo cannot read a shipment/],
  ]

  for (const [name, call, message] of cases) {
    it(`${name} throws 501 NOT_SUPPORTED and sends nothing`, async () => {
      const adapter = new GlovoAdapter()
      const err = await call(adapter).then(
        () => {
          throw new Error(`${name} resolved`)
        },
        (e: unknown) => e as Error & { statusCode?: number; code?: string },
      )
      expect(err.message).toMatch(message)
      expect(err.statusCode).toBe(501)
      expect(err.code).toBe('NOT_SUPPORTED')
      expectNoRequest()
    })
  }
})
