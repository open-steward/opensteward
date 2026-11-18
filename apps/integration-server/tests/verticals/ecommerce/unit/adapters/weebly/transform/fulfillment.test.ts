import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawShopifyFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/weebly/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeFulfillment(overrides: Partial<RawShopifyFulfillment> = {}): RawShopifyFulfillment {
  return {
    id: 200,
    order_id: 1001,
    status: 'success',
    tracking_number: '1Z999AA10123456784',
    tracking_company: 'UPS',
    tracking_url: 'https://www.ups.com/track?tracknum=1Z999AA10123456784',
    service: 'ups_ground',
    location_id: 50,
    line_items: [{ id: 11, quantity: 2 }],
    notify_customer: true,
    created_at: '2024-05-01T10:00:00.000Z',
    updated_at: '2024-05-01T10:00:00.000Z',
    ...overrides,
  }
}

describe('transformFulfillment', () => {
  it('maps core fields and stringifies id and orderId', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.id).toBe('200')
    expect(result.orderId).toBe('1001')
    expect(typeof result.id).toBe('string')
    expect(typeof result.orderId).toBe('string')
  })

  it('maps status correctly via STATUS_MAP', () => {
    expect(transformFulfillment(makeFulfillment({ status: 'success' })).status).toBe('SUCCESS')
    expect(transformFulfillment(makeFulfillment({ status: 'pending' })).status).toBe('PENDING')
    expect(transformFulfillment(makeFulfillment({ status: 'open' })).status).toBe('OPEN')
    expect(transformFulfillment(makeFulfillment({ status: 'cancelled' })).status).toBe('CANCELLED')
    expect(transformFulfillment(makeFulfillment({ status: 'canceled' })).status).toBe('CANCELLED')
    expect(transformFulfillment(makeFulfillment({ status: 'error' })).status).toBe('ERROR')
    expect(transformFulfillment(makeFulfillment({ status: 'failure' })).status).toBe('FAILURE')
  })

  it('maps tracking and carrier fields', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.trackingNumber).toBe('1Z999AA10123456784')
    expect(result.carrier).toBe('UPS')
    expect(result.trackingUrl).toBe('https://www.ups.com/track?tracknum=1Z999AA10123456784')
    expect(result.service).toBe('ups_ground')
    expect(result.locationId).toBe('50')
  })

  it('maps line items to canonical shape', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].lineItemId).toBe('11')
    expect(result.lineItems![0].quantity).toBe(2)
  })

  it('returns undefined lineItems for empty array', () => {
    const result = transformFulfillment(makeFulfillment({ line_items: [] }))
    expect(result.lineItems).toBeUndefined()
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
    expect(raw.tracking_company).toBe('UPS')
    expect(raw.location_id).toBe('50')
    expect(raw.notify_customer).toBe(true)
  })
})
