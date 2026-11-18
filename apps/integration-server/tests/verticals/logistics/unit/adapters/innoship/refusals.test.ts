/**
 * Innoship list methods the vendor cannot serve are refused with 501 before
 * any request.
 *
 * Innoship publishes two OpenAPI specs, and nothing else, from its Swagger UI
 * (https://api.innoship.io/index.html → index.js: "/swagger/v1/swagger.json"
 * "API V1" and "/swagger/v2/swagger.json" "API V2 - Beta - Work in progress").
 *
 * - Orders and shipments: the only /api/Order GETs are
 *   /api/Order/ReturnAwbInfo/{courierId}/{returnAwb} and
 *   /api/Order/DownloadDocument/courier/{courierId}/awb/{awb}; v2 has
 *   POST /api/v2/shipments/order, /price, /track and DELETE /by-awb. No
 *   collection read. The old GET /api/Order/by-location/... is in neither spec.
 * - Carriers: the Courier paths are POST /api/Courier/RequestPickup and
 *   /api/Courier/Location/{GenerateId,List,SetId}/...; there is no
 *   /api/Courier/All.
 * - Warehouses: GET /api/ClientLocation and POST /api/ClientLocation/Summary
 *   exist, but their only documented response is {"200": {"description": "OK"}}:
 *   no body schema, so there is no documented source for a location id or any
 *   other field.
 * - Tracking events: tracking is a per-AWB lookup (POST
 *   /api/v2/shipments/track "Track Awb with return info"), not a collection.
 *   GET /api/v2/notifications/by-template lists sent notifications, not
 *   carrier events.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { InnoshipAdapter } from '../../../../../../src/verticals/logistics/adapters/innoship/index'

const CREDS = { accessToken: 'innoship_test' }

function spyHttp() {
  const get = vi.fn()
  const post = vi.fn()
  const create = vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post,
    put: vi.fn(),
    delete: vi.fn(),
    defaults: { headers: { common: {} } },
  } as never)
  // Reject rather than call through, so a regression never reaches the network.
  const blocked = () => Promise.reject(new Error('network blocked in test'))
  const request = vi.spyOn(axios, 'request').mockImplementation(blocked)
  const directGet = vi.spyOn(axios, 'get').mockImplementation(blocked)
  return { create, get, post, request, directGet }
}

function expectNothingSent(h: ReturnType<typeof spyHttp>) {
  expect(h.create).not.toHaveBeenCalled()
  expect(h.get).not.toHaveBeenCalled()
  expect(h.post).not.toHaveBeenCalled()
  expect(h.request).not.toHaveBeenCalled()
  expect(h.directGet).not.toHaveBeenCalled()
}

afterEach(() => vi.restoreAllMocks())

const PARAMS = { page: 1, limit: 10 }

describe('innoship refuses lists the API cannot serve', () => {
  it('listOrders throws 501 NOT_SUPPORTED and sends no request', async () => {
    const h = spyHttp()
    await expect(new InnoshipAdapter().listOrders(CREDS, PARAMS)).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(/^Innoship cannot list orders: /),
    })
    expectNothingSent(h)
  })

  it('listCarriers throws 501 NOT_SUPPORTED and sends no request', async () => {
    const h = spyHttp()
    await expect(new InnoshipAdapter().listCarriers(CREDS, PARAMS)).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(/^Innoship cannot list carriers: /),
    })
    expectNothingSent(h)
  })

  it('listWarehouses throws 501 NOT_SUPPORTED and sends no request', async () => {
    const h = spyHttp()
    await expect(new InnoshipAdapter().listWarehouses(CREDS, PARAMS)).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(
        /^Innoship cannot list warehouses: .*GET \/api\/ClientLocation .*POST \/api\/ClientLocation\/Summary/,
      ),
    })
    expectNothingSent(h)
  })

  it('listShipments throws 501 NOT_SUPPORTED instead of reporting an empty collection', async () => {
    const h = spyHttp()
    await expect(new InnoshipAdapter().listShipments(CREDS, PARAMS)).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(/^Innoship cannot list shipments: .*shipments\/track/),
    })
    expectNothingSent(h)
  })

  it('listTrackingEvents throws 501 NOT_SUPPORTED instead of reporting an empty collection', async () => {
    const h = spyHttp()
    await expect(new InnoshipAdapter().listTrackingEvents(CREDS, PARAMS)).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(
        /^Innoship cannot list tracking events: .*shipments\/track.*notifications\/by-template .*not carrier events/,
      ),
    })
    expectNothingSent(h)
  })
})
