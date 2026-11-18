/**
 * ShipKaro documents no collection or lookup-by-id for any logistics resource.
 *
 * First-party docs: the Postman documenter at https://api.shipkaro.com/
 * (collection https://api.shipkaro.com/api/collections/405770/77o314N?segregateAuth=true&versionTag=latest).
 * It holds exactly five requests, all POST:
 *
 *   "Get Rates"                    https://{{url}}/api/1/entity/ms.fulfillment/_/getRates
 *   "Create Pickup"                https://{{url}}/api/1/entity/ms.fulfillment/_/createPickup
 *   "Track Shipment"               https://{{url}}/api/1/entity/ms.fulfillment/_/trackShipment
 *   "Check Delivery Availability"  https://{{url}}/api/1/entity/ms.fulfillment/_/checkDeliveryAvailability
 *   "Create Sub Account"           https://{{url}}/api/1/entity/ms.plans_and_billing/_/createSubAccount
 *
 * The REST paths the list and get methods used to call (/orders, /shipments,
 * /carriers, /pickup-addresses, /labels, /manifests and their /:id forms on
 * api.shipkaro.com) appear nowhere in it, so every one of them refuses with
 * 501 NOT_SUPPORTED before building a client or sending anything.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink } from '@opensteward/shared'
import { ShipKaroAdapter } from '../../../../../../src/verticals/logistics/adapters/shipkaro/index'

const CREDS = { accessToken: 'ACCESS_KEY' }

function spyHttp() {
  const post = vi.fn(async () => ({ data: {} }))
  const get = vi.fn(async () => ({ data: {} }))
  const create = vi.spyOn(axios, 'create').mockReturnValue({ get, post } as never)
  return { post, get, create }
}

afterEach(() => vi.restoreAllMocks())

const NOT_SUPPORTED = expect.objectContaining({ statusCode: 501, code: 'NOT_SUPPORTED' })

type ListMethod =
  | 'listOrders'
  | 'listShipments'
  | 'listCarriers'
  | 'listWarehouses'
  | 'listLabels'
  | 'listManifests'
type GetMethod =
  'getOrder' | 'getShipment' | 'getCarrier' | 'getWarehouse' | 'getLabel' | 'getManifest'

const LISTS: Array<[ListMethod, string]> = [
  ['listOrders', 'orders'],
  ['listShipments', 'shipments'],
  ['listCarriers', 'carriers'],
  ['listWarehouses', 'warehouses'],
  ['listLabels', 'labels'],
  ['listManifests', 'manifests'],
]

const GETS: Array<[GetMethod, string]> = [
  ['getOrder', 'an order'],
  ['getShipment', 'a shipment'],
  ['getCarrier', 'a carrier'],
  ['getWarehouse', 'a warehouse'],
  ['getLabel', 'a label'],
  ['getManifest', 'a manifest'],
]

async function expectRefusal(
  call: () => Promise<unknown>,
  pattern: RegExp,
  http: ReturnType<typeof spyHttp>,
) {
  const err = await call().catch((e: unknown) => e)
  expect(err).toBeInstanceOf(Error)
  expect(err).toEqual(NOT_SUPPORTED)
  expect((err as Error).message).toMatch(pattern)
  expect((err as Error).message).toMatch(
    /"Get Rates", "Create Pickup", "Track Shipment", "Check Delivery Availability", "Create Sub Account"/,
  )
  expect(http.post).not.toHaveBeenCalled()
  expect(http.get).not.toHaveBeenCalled()
  expect(http.create).not.toHaveBeenCalled()
}

describe('shipkaro list methods refuse without a request', () => {
  const pages: Array<[string, Parameters<ShipKaroAdapter['listOrders']>[1]]> = [
    ['page 1', withPageSink({ page: 1, limit: 10 })],
    [
      'page 2 with updatedAfter',
      withPageSink({ page: 2, limit: 10, updatedAfter: new Date('2026-01-01T00:00:00Z') }),
    ],
  ]

  for (const [method, resource] of LISTS) {
    for (const [name, params] of pages) {
      it(`${method} ${name}: throws 501 NOT_SUPPORTED and sends no request`, async () => {
        const http = spyHttp()
        await expectRefusal(
          () => new ShipKaroAdapter()[method](CREDS, params),
          new RegExp(`^ShipKaro cannot list ${resource}:`),
          http,
        )
      })
    }
  }
})

describe('shipkaro get-by-id methods refuse without a request', () => {
  for (const [method, resource] of GETS) {
    it(`${method}: throws 501 NOT_SUPPORTED and sends no request`, async () => {
      const http = spyHttp()
      await expectRefusal(
        () => new ShipKaroAdapter()[method](CREDS, 'abc123'),
        new RegExp(`^ShipKaro cannot read ${resource} by id:`),
        http,
      )
    })
  }
})
