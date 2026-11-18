/**
 * Freightify documents no shipment collection and no tracking-event collection.
 *
 * First-party Track & Trace spec (embedded by freightify.com/api-product-swagger-track-trace):
 * https://cdn.freightbro.in/docs/track/freightify-api.yaml
 *
 *   "/v1/track/container/{containerId}": { "get": { "summary": "Track a shipment by its container number." ...
 *   "/v1/track/bl/{blNumber}": { "get": { "summary": "Track a shipment by its BL number." ...
 *   { "name": "sealine", "in": "query", ... "required": true, "description": "carrier scac" }
 *
 * Those are the spec's only two paths: per-container and per-BL lookups that
 * each require the carrier SCAC. The Schedules spec
 * (https://cdn.freightbro.in/docs/schedules/freightify-api.yaml) has only
 * `/v1/schedules`. Nothing lists shipments or tracking events, and nothing
 * reads a shipment by id, so these reads refuse with 501 before any request.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink } from '@opensteward/shared'
import { FreightifyAdapter } from '../../../../../../src/verticals/logistics/adapters/freightify/index'

const CREDS = { accessToken: 'fy-test-key' }

function spyHttp() {
  const post = vi.fn(async () => ({ data: {} }))
  const get = vi.fn(async () => ({ data: {} }))
  const create = vi.spyOn(axios, 'create').mockReturnValue({ get, post } as never)
  return { post, get, create }
}

afterEach(() => vi.restoreAllMocks())

const NOT_SUPPORTED = expect.objectContaining({ statusCode: 501, code: 'NOT_SUPPORTED' })

describe('freightify shipment and tracking reads refuse without a request', () => {
  const cases: Array<[string, (a: FreightifyAdapter) => Promise<unknown>, RegExp]> = [
    [
      'listShipments',
      (a) => a.listShipments(CREDS, withPageSink({ page: 1, limit: 10 })),
      /Freightify cannot list shipments/,
    ],
    [
      'listShipments with updatedAfter',
      (a) =>
        a.listShipments(
          CREDS,
          withPageSink({ page: 2, limit: 10, updatedAfter: new Date('2026-01-01T00:00:00Z') }),
        ),
      /Freightify cannot list shipments/,
    ],
    [
      'listTrackingEvents',
      (a) => a.listTrackingEvents(CREDS, withPageSink({ page: 1, limit: 10 })),
      /Freightify cannot list tracking events/,
    ],
    ['getShipment', (a) => a.getShipment(CREDS, 'BK-1042'), /Freightify cannot read shipments/],
    [
      'getTrackingEvents',
      (a) => a.getTrackingEvents(CREDS, 'BEAU5097502'),
      /Freightify cannot read tracking events/,
    ],
  ]

  for (const [name, call, message] of cases) {
    it(`${name} throws 501 NOT_SUPPORTED and sends nothing`, async () => {
      const http = spyHttp()
      const err = await call(new FreightifyAdapter()).catch((e: unknown) => e)
      expect(err).toEqual(NOT_SUPPORTED)
      expect(String((err as Error).message)).toMatch(message)
      expect(http.create).not.toHaveBeenCalled()
      expect(http.get).not.toHaveBeenCalled()
      expect(http.post).not.toHaveBeenCalled()
    })
  }
})
