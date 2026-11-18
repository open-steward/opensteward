import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawShopifyFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/logicommerce/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeFulfillment(overrides: Partial<RawShopifyFulfillment> = {}): RawShopifyFulfillment {
  return {
    id: 701,
    order_id: 801,
    status: 'success',
    tracking_number: '1Z999AA10123456784',
    tracking_url: 'https://www.ups.com/track?tracknum=1Z999AA10123456784',
    tracking_company: 'UPS',
    service: 'Ground',
    location_id: 901,
    line_items: [{ id: 11, quantity: 2 }],
    notify_customer: true,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('transformFulfillment (logicommerce / Shopify)', () => {
  it('maps id to string', () => {
    const result = transformFulfillment(makeFulfillment({ id: 42 }))
    expect(result.id).toBe('42')
  })

  it('maps order_id to orderId', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.orderId).toBe('801')
  })

  it('maps success status to SUCCESS', () => {
    const result = transformFulfillment(makeFulfillment({ status: 'success' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps error status to ERROR', () => {
    const result = transformFulfillment(makeFulfillment({ status: 'error' }))
    expect(result.status).toBe('ERROR')
  })

  it('maps tracking_company to carrier', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.carrier).toBe('UPS')
  })

  it('maps line_items', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.lineItems?.[0]?.lineItemId).toBe('11')
    expect(result.lineItems?.[0]?.quantity).toBe(2)
  })

  it('stores raw payload in metadata', () => {
    const raw = makeFulfillment()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying FulfillmentSchema', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})

describe('untransformFulfillment (logicommerce / Shopify)', () => {
  it('round-trips tracking and carrier', () => {
    const canonical = transformFulfillment(makeFulfillment())
    const body = untransformFulfillment(canonical)
    expect(body.tracking_number).toBe('1Z999AA10123456784')
    expect(body.tracking_company).toBe('UPS')
  })
})
