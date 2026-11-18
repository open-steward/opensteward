/**
 * Vamaship documents no collection endpoint for carriers, shipments, orders,
 * labels or warehouses.
 *
 * First-party API Blueprints behind https://vamaship.docs.apiary.io/:
 *   https://jsapi.apiary.io/apis/vamaship.source        (Air Domestic API)
 *   https://jsapi.apiary.io/apis/vamashipsurface.source (Surface Domestic API)
 *
 * Their only routes are POST /dom/coverage, /dom/quote, /dom/quote-reverse,
 * /dom/book, /dom/book-reverse, /cancel, the /surface/* equivalents, and the
 * lookups GET /details/{reference_id}, /track/{order_ids},
 * /trackawb/{awbs}, /track/withReferenceNumbers/{references} and
 * /download/... The words "courier" and "warehouse" and the paths
 * dom/shipments, dom/orders, dom/labels and dom/warehouses appear in neither.
 * Every list, and each paired get on the same undocumented path, refuses
 * with 501 before sending anything.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink } from '@opensteward/shared'
import { VamashipAdapter } from '../../../../../../src/verticals/logistics/adapters/vamaship/index'

const CREDS = { accessToken: 'YOUR-TOKEN' }

function spyHttp() {
  const post = vi.fn(async () => ({ data: {} }))
  const get = vi.fn(async () => ({ data: {} }))
  const create = vi.spyOn(axios, 'create').mockReturnValue({ get, post } as never)
  return { post, get, create }
}

afterEach(() => vi.restoreAllMocks())

const PAGE = () => withPageSink({ page: 1, limit: 10 })

describe('vamaship reads without a documented endpoint refuse without a request', () => {
  const cases: Array<[string, (a: VamashipAdapter) => Promise<unknown>, RegExp]> = [
    [
      'listCarriers',
      (a) => a.listCarriers(CREDS, PAGE()),
      /Vamaship cannot list carriers: the only supplier list is POST \/dom\/coverage.*origin pickup pincode/,
    ],
    ['getCarrier', (a) => a.getCarrier(CREDS, '133'), /Vamaship cannot read carriers/],
    ['listShipments', (a) => a.listShipments(CREDS, PAGE()), /Vamaship cannot list shipments/],
    [
      'listShipments with updatedAfter',
      (a) =>
        a.listShipments(
          CREDS,
          withPageSink({ page: 2, limit: 10, updatedAfter: new Date('2026-01-01T00:00:00Z') }),
        ),
      /Vamaship cannot list shipments/,
    ],
    ['getShipment', (a) => a.getShipment(CREDS, '300980315'), /Vamaship cannot read shipments/],
    ['listOrders', (a) => a.listOrders(CREDS, PAGE()), /Vamaship cannot list orders/],
    ['getOrder', (a) => a.getOrder(CREDS, '300980315'), /Vamaship cannot read orders/],
    ['listLabels', (a) => a.listLabels(CREDS, PAGE()), /Vamaship cannot list labels/],
    ['getLabel', (a) => a.getLabel(CREDS, '1610369172136'), /Vamaship cannot read labels/],
    ['listWarehouses', (a) => a.listWarehouses(CREDS, PAGE()), /Vamaship cannot list warehouses/],
    ['getWarehouse', (a) => a.getWarehouse(CREDS, '1'), /Vamaship cannot read warehouses/],
  ]

  for (const [name, call, message] of cases) {
    it(`${name} throws 501 NOT_SUPPORTED and sends no request`, async () => {
      const { post, get, create } = spyHttp()
      const err = await call(new VamashipAdapter()).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(Error)
      expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      expect((err as Error).message).toMatch(message)
      expect(create).not.toHaveBeenCalled()
      expect(get).not.toHaveBeenCalled()
      expect(post).not.toHaveBeenCalled()
    })
  }
})
