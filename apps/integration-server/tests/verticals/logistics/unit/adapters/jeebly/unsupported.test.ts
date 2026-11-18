/**
 * Jeebly documents no read endpoint of any kind.
 *
 * First-party spec, linked from https://jeebly.com/technology/ as
 * https://rest.jeeblynow.com/api/v1/integrations/swagger-ui/ and served at
 * https://rest.jeeblynow.com/api/v1/integrations/swagger/?format=openapi.
 * Its `paths` object holds exactly six operations:
 *
 *   PATCH /api/v1/integrations/api_order_update/{slug}
 *   POST  /api/v1/integrations/generate_token
 *   GET   /api/v1/integrations/order/cancel/{slug}
 *   PATCH /api/v1/integrations/order/cancel_v2/{slug}
 *   PATCH /api/v1/integrations/order/return/{slug}
 *   POST  /api/v1/integrations/order_location_wise
 *
 * None lists or reads shipments, orders or tracking, and the host the
 * adapter called (api.jeebly.com) does not resolve (NXDOMAIN). Every read
 * therefore refuses with 501 before sending anything.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink } from '@opensteward/shared'
import { JeeblyAdapter } from '../../../../../../src/verticals/logistics/adapters/jeebly/index'

const CREDS = { accessToken: 'jeebly-key' }

function spyHttp() {
  const get = vi.fn(async () => ({ data: {} }))
  const post = vi.fn(async () => ({ data: {} }))
  const put = vi.fn(async () => ({ data: {} }))
  const create = vi.spyOn(axios, 'create').mockReturnValue({ get, post, put } as never)
  return { get, post, put, create }
}

afterEach(() => vi.restoreAllMocks())

const NOT_SUPPORTED = expect.objectContaining({ statusCode: 501, code: 'NOT_SUPPORTED' })

describe('jeebly reads refuse without a request', () => {
  const cases: Array<[string, (a: JeeblyAdapter) => Promise<unknown>, RegExp]> = [
    [
      'listShipments',
      (a) => a.listShipments(CREDS, withPageSink({ page: 1, limit: 10 })),
      /Jeebly cannot list shipments/,
    ],
    [
      'listShipments with updatedAfter',
      (a) =>
        a.listShipments(
          CREDS,
          withPageSink({ page: 2, limit: 10, updatedAfter: new Date('2026-01-01T00:00:00Z') }),
        ),
      /Jeebly cannot list shipments/,
    ],
    [
      'listOrders',
      (a) => a.listOrders(CREDS, withPageSink({ page: 1, limit: 10 })),
      /Jeebly cannot list orders/,
    ],
    [
      'listTrackingEvents',
      (a) => a.listTrackingEvents(CREDS, withPageSink({ page: 1, limit: 10 })),
      /Jeebly cannot list tracking events/,
    ],
    ['getShipment', (a) => a.getShipment(CREDS, 'SHP-1'), /Jeebly cannot read shipments/],
    ['getOrder', (a) => a.getOrder(CREDS, 'ORD-1'), /Jeebly cannot read orders/],
    [
      'getTrackingEvents',
      (a) => a.getTrackingEvents(CREDS, 'AWB-1'),
      /Jeebly cannot read tracking events/,
    ],
  ]

  for (const [name, call, message] of cases) {
    it(`${name} throws 501 NOT_SUPPORTED and sends no request`, async () => {
      const http = spyHttp()
      const adapter = new JeeblyAdapter()
      const err = await call(adapter).catch((e: unknown) => e)
      expect(err).toEqual(NOT_SUPPORTED)
      expect((err as Error).message).toMatch(message)
      expect((err as Error).message).toMatch(/swagger/)
      expect(http.create).not.toHaveBeenCalled()
      expect(http.get).not.toHaveBeenCalled()
      expect(http.post).not.toHaveBeenCalled()
      expect(http.put).not.toHaveBeenCalled()
    })
  }
})
