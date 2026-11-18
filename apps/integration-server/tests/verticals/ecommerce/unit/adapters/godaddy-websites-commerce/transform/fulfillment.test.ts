import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawShopifyFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/godaddy-websites-commerce/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeFulfillment(overrides: Partial<RawShopifyFulfillment> = {}): RawShopifyFulfillment {
  return {
    id: 8001,
    order_id: 1001,
    status: 'success',
    tracking_number: 'TRACK123',
    tracking_url: 'https://tracking.example.com/TRACK123',
    tracking_company: 'FedEx',
    service: 'Ground',
    location_id: 555,
    line_items: [{ id: 9001, quantity: 2 }],
    notify_customer: true,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('transformFulfillment (GoDaddy Websites + Commerce / Shopify shapes)', () => {
  it('maps core fields and stringifies ids', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.id).toBe('8001')
    expect(result.orderId).toBe('1001')
    expect(result.locationId).toBe('555')
  })

  it('maps tracking fields', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.trackingNumber).toBe('TRACK123')
    expect(result.trackingUrl).toBe('https://tracking.example.com/TRACK123')
    expect(result.carrier).toBe('FedEx')
  })

  it('maps status enum', () => {
    expect(transformFulfillment(makeFulfillment({ status: 'success' })).status).toBe('SUCCESS')
    expect(transformFulfillment(makeFulfillment({ status: 'open' })).status).toBe('OPEN')
    expect(transformFulfillment(makeFulfillment({ status: 'pending' })).status).toBe('PENDING')
    expect(transformFulfillment(makeFulfillment({ status: 'cancelled' })).status).toBe('CANCELLED')
    expect(transformFulfillment(makeFulfillment({ status: 'error' })).status).toBe('ERROR')
    expect(transformFulfillment(makeFulfillment({ status: 'failure' })).status).toBe('FAILURE')
  })

  it('maps line items', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]).toEqual({ lineItemId: '9001', quantity: 2 })
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

  it('round-trips via untransformFulfillment', () => {
    const canonical = transformFulfillment(makeFulfillment())
    const back = untransformFulfillment(canonical)
    expect(back.tracking_number).toBe('TRACK123')
    expect(back.tracking_company).toBe('FedEx')
  })
})
