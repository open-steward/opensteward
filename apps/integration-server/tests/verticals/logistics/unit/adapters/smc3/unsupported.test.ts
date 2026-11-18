/**
 * SMC3 CarrierConnect XL documents no shipment or tracking-event resource.
 *
 * First-party spec, served by SMC3's CCXL host:
 * https://ccxl.smc3.com/CarrierConnectXL/services/rest/v3_2/swagger.yaml
 *
 *   /transit:
 *     post:
 *       summary: Get Transit (Formerly Simple Transit)
 *   TransitRequest:
 *     properties: carriers, destination, origin, pickupDate, shipmentId
 *
 * The spec's operations are isready, transitPlanning, transit,
 * terminalsbypostalcode, terminalbyterminalcode, carrierservices and
 * terminalsbycarrier. /transit is a per-lane transit-time lookup, not a
 * shipment collection or an event history, so every shipment and tracking
 * read refuses with 501 before sending anything.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink } from '@opensteward/shared'
import { Smc3Adapter } from '../../../../../../src/verticals/logistics/adapters/smc3/index'

const CREDS = { accessToken: 'demo@smc3.com|demosmc3|iKWMI09YN5GS' }

function spyHttp() {
  const post = vi.fn(async () => ({ data: {} }))
  const get = vi.fn(async () => ({ data: {} }))
  const create = vi.spyOn(axios, 'create').mockReturnValue({ get, post } as never)
  return { post, get, create }
}

afterEach(() => vi.restoreAllMocks())

const NOT_SUPPORTED = expect.objectContaining({ statusCode: 501, code: 'NOT_SUPPORTED' })

describe('smc3 shipment and tracking reads refuse without a request', () => {
  const cases: Array<[string, (a: Smc3Adapter) => Promise<unknown>, RegExp]> = [
    [
      'listShipments',
      (a) => a.listShipments(CREDS, withPageSink({ page: 1, limit: 10 })),
      /SMC3 cannot list shipments/,
    ],
    [
      'listShipments with updatedAfter',
      (a) =>
        a.listShipments(
          CREDS,
          withPageSink({ page: 2, limit: 10, updatedAfter: new Date('2026-01-01T00:00:00Z') }),
        ),
      /SMC3 cannot list shipments/,
    ],
    [
      'listTrackingEvents',
      (a) => a.listTrackingEvents(CREDS, withPageSink({ page: 1, limit: 10 })),
      /SMC3 cannot list tracking events/,
    ],
    ['getShipment', (a) => a.getShipment(CREDS, 'PRO123'), /SMC3 cannot read shipments/],
    [
      'getTrackingEvents',
      (a) => a.getTrackingEvents(CREDS, 'PRO123'),
      /SMC3 cannot read tracking events/,
    ],
  ]

  for (const [name, call, message] of cases) {
    it(`${name} throws 501 NOT_SUPPORTED and sends no request`, async () => {
      const { post, get, create } = spyHttp()
      const err = await call(new Smc3Adapter()).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(Error)
      expect(err).toEqual(NOT_SUPPORTED)
      expect((err as Error).message).toMatch(message)
      expect((err as Error).message).toMatch(/per-lane transit-time lookup/)
      expect(post).not.toHaveBeenCalled()
      expect(get).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
    })
  }
})
