/**
 * Gophr V2 Commercial API job -> canonical Order.
 *
 * Fixture fields come from the first-party OpenAPI embedded in
 * https://developers.gophr.com/reference/get-job.md: `Response-Create-Multidrop-Job`
 * = Field-Job-Id (`job_id`), Field-Is-Confirmed, Field-Vehicle-Types,
 * Field-Collection-Job-Prices (`price_net` / `price_gross`, each a
 * Field-Collection-Money `{ amount, currency }`), Field-Job-Priority,
 * Field-Distance and `deliveries[]` (Response-Deliveries: `delivery_id`,
 * `status`, `leg_type`, links, sequence numbers, `parcels`).
 */
import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'
import {
  transformOrder,
  type GophrJob,
} from '../../../../../../../src/verticals/logistics/adapters/gophr/transform/order'

function documentedJob(): GophrJob {
  return {
    job_id: '6fc35274-60a1-4fb3-9791-4f45c492r132',
    is_confirmed: 1,
    vehicle_type: 10,
    job_priority: 0,
    distance: 25,
    price_net: { amount: 1.99, currency: 'GBP' },
    price_gross: { amount: 2.39, currency: 'GBP' },
    deliveries: [
      {
        delivery_id: '74afea12-24aa-44c7-a55b-b2dc2a9a02d3',
        status: 'DELIVERED',
        leg_type: 'STANDARD',
        private_job_url: 'http://example.com',
        public_tracker_url: 'http://example.com',
        pickup_sequence_number: 1,
        dropoff_sequence_number: 2,
        parcels: [
          {
            parcel_id: '12345',
            parcel_external_id: '12345',
            barcode_reference: '7fc35278-60a1-4fb3-9791-4f45c492e120',
          },
        ],
      },
    ],
  }
}

describe('gophr transformOrder', () => {
  it('maps the documented job to a schema-valid Order', () => {
    const raw = documentedJob()
    const order = OrderSchema.parse(transformOrder(raw))
    expect(order.id).toBe('6fc35274-60a1-4fb3-9791-4f45c492r132')
    expect(order.shipmentIds).toEqual(['74afea12-24aa-44c7-a55b-b2dc2a9a02d3'])
    expect(order.totalAmount).toBe(239)
    expect(order.currency).toBe('GBP')
    expect(order.metadata).toEqual(raw)
  })

  it('reads no status, addresses or dates: the job schema documents none', () => {
    const order = OrderSchema.parse(transformOrder(documentedJob()))
    expect(order.status).toBeUndefined()
    expect(order.originAddress).toBeUndefined()
    expect(order.destinationAddress).toBeUndefined()
    expect(order.createdAt).toBeUndefined()
    expect(order.updatedAt).toBeUndefined()
  })

  it('omits the amount when price_gross carries no currency', () => {
    const raw = { ...documentedJob(), price_gross: { amount: 2.39 } }
    const order = OrderSchema.parse(transformOrder(raw))
    expect(order.totalAmount).toBeUndefined()
    expect(order.currency).toBeUndefined()
  })

  it('omits the amount when price_gross is a bare number (the x-example shape): no currency', () => {
    const raw = { ...documentedJob(), price_gross: 4.56 } as unknown as GophrJob
    const order = OrderSchema.parse(transformOrder(raw))
    expect(order.totalAmount).toBeUndefined()
    expect(order.currency).toBeUndefined()
  })

  it('omits a negative amount, which OrderSchema.totalAmount (min 0) would reject', () => {
    const raw = { ...documentedJob(), price_gross: { amount: -2.39, currency: 'GBP' } }
    const order = OrderSchema.parse(transformOrder(raw))
    expect(order.totalAmount).toBeUndefined()
    expect(order.currency).toBeUndefined()
  })

  it('does not fall back to price_net', () => {
    const { price_gross: _drop, ...raw } = documentedJob()
    const order = OrderSchema.parse(transformOrder(raw))
    expect(order.totalAmount).toBeUndefined()
  })

  it('omits shipmentIds when the job has no deliveries', () => {
    const order = OrderSchema.parse(transformOrder({ job_id: 'J1', deliveries: [] }))
    expect(order.shipmentIds).toBeUndefined()
  })

  it('throws when job_id (required by Field-Job-Id) is missing', () => {
    expect(() => transformOrder({} as GophrJob)).toThrow(/job_id/)
  })
})
