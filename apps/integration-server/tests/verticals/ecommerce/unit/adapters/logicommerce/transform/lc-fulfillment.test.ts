import { describe, it, expect } from 'vitest'
import {
  transformLogicommerceShipment,
  type RawLogicommerceShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/logicommerce/transform/lc-fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'
import { fixture } from '../fixtures/load'

const shipment = fixture<{ SHIPMENTS: RawLogicommerceShipment[] }>('order-shipments').SHIPMENTS[0]!

describe('transformLogicommerceShipment', () => {
  it('maps the documented GET /orders/{id}/shipments row to a valid canonical Fulfillment', () => {
    const out = FulfillmentSchema.parse(transformLogicommerceShipment(shipment, '1'))
    expect(out).toMatchObject({ id: '1:108', orderId: '1', trackingNumber: 'TRK-123' })
    expect(out.metadata).toEqual(shipment)
  })

  it('leaves out an empty tracking number', () => {
    const out = transformLogicommerceShipment({ ID: 9, TRACKINGNUMBER: '' }, '5')
    expect(out.trackingNumber).toBeUndefined()
  })
})
