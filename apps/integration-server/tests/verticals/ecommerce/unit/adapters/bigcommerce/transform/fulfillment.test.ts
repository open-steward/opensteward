import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawBigCommerceShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/bigcommerce/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeShipment(overrides: Partial<RawBigCommerceShipment> = {}): RawBigCommerceShipment {
  return {
    id: 50,
    order_id: 1001,
    tracking_number: '1Z999AA10123456784',
    tracking_link: 'https://example.com/track/1Z999AA10123456784',
    shipping_provider: 'UPS',
    shipping_method: 'Ground',
    items: [
      { order_product_id: 9001, product_id: 112, quantity: 2 },
    ],
    date_created: '2024-05-02T09:00:00Z',
    ...overrides,
  }
}

describe('transformFulfillment', () => {
  it('maps core fields and sets status to SUCCESS', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.id).toBe('50')
    expect(typeof result.id).toBe('string')
    expect(result.orderId).toBe('1001')
    expect(result.status).toBe('SUCCESS')
    expect(result.trackingNumber).toBe('1Z999AA10123456784')
    expect(result.carrier).toBe('UPS')
    expect(result.service).toBe('Ground')
  })

  it('maps line items', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.lineItems).toEqual([{ lineItemId: '9001', quantity: 2 }])
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeShipment()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeShipment())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformFulfillment', () => {
    const canonical = transformFulfillment(makeShipment())
    const raw = untransformFulfillment(canonical)
    expect(raw.tracking_number).toBe('1Z999AA10123456784')
    expect(raw.tracking_link).toBe('https://example.com/track/1Z999AA10123456784')
    expect(raw.shipping_provider).toBe('UPS')
  })
})
