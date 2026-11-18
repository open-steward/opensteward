/**
 * Swell shipment transform, against "The shipment model" example
 * (https://developers.swell.is/backend-api/shipments).
 */
import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  type RawSwellShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/swell/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

const DOC_SHIPMENT: RawSwellShipment = {
  id: '60f199509111e70000000089',
  items: [
    {
      id: '5ca537326a0ec32a521139dd',
      order_item_id: null,
      product_id: '5cad15bc9b14d1990724663b',
      quantity: 2,
    },
  ],
  order_id: '60f199509111e7000000008b',
  date_created: '2021-07-16T14:36:00.413Z',
  date_updated: '2021-07-16T14:36:00.413Z',
  destination: {
    name: 'Hieronymus Lex',
    address1: "South Watch Tower, Captain's Quarters",
    city: 'Imperial City',
    state: 'NY',
    zip: 11201,
    country: 'US',
    phone: '(555) 555-5555',
  },
  service: 'imperial_express',
  tracking_code: 'T192000000XYZ',
}

describe('swell transformFulfillment', () => {
  it('maps the documented shipment example and parses as a Fulfillment', () => {
    const f = FulfillmentSchema.parse(transformFulfillment(DOC_SHIPMENT))
    expect(f.id).toBe('60f199509111e70000000089')
    expect(f.orderId).toBe('60f199509111e7000000008b')
    expect(f.trackingNumber).toBe('T192000000XYZ')
    expect(f.status).toBeUndefined()
    // The documented item has order_item_id null: it names no order line.
    expect(f.lineItems).toBeUndefined()
    expect(f.createdAt).toBe('2021-07-16T14:36:00.413Z')
  })

  it('maps order items, carrier, service, origin and the canceled/draft flags', () => {
    const f = FulfillmentSchema.parse(
      transformFulfillment({
        ...DOC_SHIPMENT,
        carrier_name: 'UPS',
        service_name: 'Imperial Express',
        origin: { location: 'loc_1' },
        canceled: true,
        items: [{ order_item_id: 'oi_1' }, { order_item_id: 'oi_2', quantity: 3 }],
      }),
    )
    expect(f.status).toBe('CANCELLED')
    expect(f.carrier).toBe('UPS')
    expect(f.service).toBe('Imperial Express')
    expect(f.locationId).toBe('loc_1')
    // "Quantity of the item shipped. Defaults to 1."
    expect(f.lineItems).toEqual([
      { lineItemId: 'oi_1', quantity: 1 },
      { lineItemId: 'oi_2', quantity: 3 },
    ])
    expect(
      FulfillmentSchema.parse(transformFulfillment({ ...DOC_SHIPMENT, draft: true })).status,
    ).toBe('PENDING')
  })

  it('refuses a shipment without order_id', () => {
    expect(() => transformFulfillment({ ...DOC_SHIPMENT, order_id: null })).toThrow(/no order_id/)
  })
})
