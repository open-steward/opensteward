import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawShopifyFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopify/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeFulfillment(overrides: Partial<RawShopifyFulfillment> = {}): RawShopifyFulfillment {
  return {
    id: 8001,
    order_id: 1001,
    status: 'success',
    tracking_number: '1Z999AA10123456784',
    tracking_url: 'https://example.com/track/1Z999AA10123456784',
    tracking_company: 'UPS',
    service: 'manual',
    location_id: 42,
    line_items: [
      { id: 9001, quantity: 2 },
    ],
    notify_customer: true,
    created_at: '2024-05-02T09:00:00Z',
    updated_at: '2024-05-02T09:00:00Z',
    ...overrides,
  }
}

describe('transformFulfillment', () => {
  it('maps core fields and uppercases the status', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.id).toBe('8001')
    expect(typeof result.id).toBe('string')
    expect(result.orderId).toBe('1001')
    expect(result.status).toBe('SUCCESS')
    expect(result.trackingNumber).toBe('1Z999AA10123456784')
    expect(result.carrier).toBe('UPS')
    expect(result.locationId).toBe('42')
  })

  it('maps line items', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.lineItems).toEqual([{ lineItemId: '9001', quantity: 2 }])
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeFulfillment()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformFulfillment', () => {
    const canonical = transformFulfillment(makeFulfillment())
    const raw = untransformFulfillment(canonical)
    expect(raw.tracking_number).toBe('1Z999AA10123456784')
    expect(raw.tracking_url).toBe('https://example.com/track/1Z999AA10123456784')
    expect(raw.tracking_company).toBe('UPS')
    expect(raw.location_id).toBe('42')
  })
})
