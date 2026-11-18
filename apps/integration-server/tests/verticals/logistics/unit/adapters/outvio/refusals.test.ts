/**
 * Outvio documents no shipment, order, tracking-event or label collection.
 *
 * First-party spec: https://developers.outvio.com/openapi.json
 * ("title": "Outvio API", "servers": [{ "url": "https://api.outvio.com" }]).
 *
 * Its only GET operations are:
 *   GET /v1/order/batch/{batchId}          Result of Batch Order Creation
 *   GET /v1/order/labels/{orderOrOtn}      Retrieve Labels
 *   GET /courier/list                      Retrieve Couriers & Shipping methods
 *   GET /v1/courier/services/warehouse/{warehouseName}
 *   GET /v1/courier                        Retrieve Couriers
 *   GET /v1/courier/{warehouseId}          Retrieve Couriers by Warehouse ID
 *   GET /v1/warehouse                      Retrieve Warehouses
 *   GET /v1/shipping-list                  Retrieve Shipping List Report
 *   GET /v1/shipping-list/history          Get Shipping List History
 *
 * There is no /v1/shipments, /v1/orders, /v1/tracking or /v1/labels path, and
 * no read of one shipment, order, tracking history or label by id. Labels are
 * readable only per order ("labels": "List of URLs of labels."). Every one of
 * these reads therefore refuses with 501 before sending anything.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink } from '@opensteward/shared'
import { OutvioAdapter } from '../../../../../../src/verticals/logistics/adapters/outvio/index'

const CREDS = { accessToken: '123456789-123456789-123456789-123456789' }

function spyHttp() {
  const get = vi.fn(async () => ({ data: {} }))
  const post = vi.fn(async () => ({ data: {} }))
  const put = vi.fn(async () => ({ data: {} }))
  const del = vi.fn(async () => ({ data: {} }))
  const request = vi.fn(async () => ({ data: {} }))
  const create = vi
    .spyOn(axios, 'create')
    .mockReturnValue({ get, post, put, delete: del, request } as never)
  const direct = [
    vi.spyOn(axios, 'get').mockResolvedValue({ data: {} }),
    vi.spyOn(axios, 'post').mockResolvedValue({ data: {} }),
    vi.spyOn(axios, 'request').mockResolvedValue({ data: {} }),
  ]
  return { calls: [get, post, put, del, request, create, ...direct] }
}

afterEach(() => vi.restoreAllMocks())

const NOT_SUPPORTED = expect.objectContaining({ statusCode: 501, code: 'NOT_SUPPORTED' })

describe('outvio reads with no documented endpoint refuse without a request', () => {
  const cases: Array<[string, (a: OutvioAdapter) => Promise<unknown>, RegExp]> = [
    [
      'listShipments',
      (a) => a.listShipments(CREDS, withPageSink({ page: 1, limit: 10 })),
      /Outvio cannot list shipments/,
    ],
    [
      'listShipments page 2 with updatedAfter',
      (a) =>
        a.listShipments(
          CREDS,
          withPageSink({ page: 2, limit: 10, updatedAfter: new Date('2026-01-01T00:00:00Z') }),
        ),
      /Outvio cannot list shipments/,
    ],
    ['getShipment', (a) => a.getShipment(CREDS, 'shp_1'), /Outvio cannot read shipments/],
    [
      'listOrders',
      (a) => a.listOrders(CREDS, withPageSink({ page: 1, limit: 10 })),
      /Outvio cannot list orders/,
    ],
    ['getOrder', (a) => a.getOrder(CREDS, 'ord_1'), /Outvio cannot read orders/],
    [
      'listTrackingEvents',
      (a) => a.listTrackingEvents(CREDS, withPageSink({ page: 1, limit: 10 })),
      /Outvio cannot list tracking events/,
    ],
    [
      'getTrackingEvents',
      (a) => a.getTrackingEvents(CREDS, 'TRK1'),
      /Outvio cannot read tracking events/,
    ],
    [
      'listLabels',
      (a) => a.listLabels(CREDS, withPageSink({ page: 1, limit: 10 })),
      /Outvio cannot list labels/,
    ],
    ['getLabel', (a) => a.getLabel(CREDS, 'lbl_1'), /Outvio cannot read labels by id/],
  ]

  for (const [name, call, message] of cases) {
    it(`${name} throws 501 NOT_SUPPORTED and sends no request`, async () => {
      const { calls } = spyHttp()
      const adapter = new OutvioAdapter()
      await expect(call(adapter)).rejects.toThrow(message)
      await expect(call(adapter)).rejects.toEqual(NOT_SUPPORTED)
      for (const fn of calls) expect(fn).not.toHaveBeenCalled()
    })
  }
})
