import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawSapoFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/sapo/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeFulfillment(overrides: Partial<RawSapoFulfillment> = {}): RawSapoFulfillment {
  return {
    id: 6001,
    order_id: 1001,
    status: 'success',
    tracking_number: 'VN123456789',
    tracking_url: 'https://track.viettelpost.vn/VN123456789',
    tracking_company: 'Viettel Post',
    service: 'standard',
    location_id: 44,
    line_items: [
      { id: 201, quantity: 2 },
      { id: 202, quantity: 1 },
    ],
    notify_customer: true,
    created_on: '2024-04-01T07:00:00Z',
    modified_on: '2024-04-02T12:00:00Z',
    ...overrides,
  }
}

describe('transformFulfillment (Sapo)', () => {
  it('stringifies id and order_id', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.id).toBe('6001')
    expect(result.orderId).toBe('1001')
  })

  it('maps status string to canonical enum', () => {
    expect(transformFulfillment(makeFulfillment({ status: 'success' })).status).toBe('SUCCESS')
    expect(transformFulfillment(makeFulfillment({ status: 'pending' })).status).toBe('PENDING')
    expect(transformFulfillment(makeFulfillment({ status: 'cancelled' })).status).toBe('CANCELLED')
    expect(transformFulfillment(makeFulfillment({ status: 'canceled' })).status).toBe('CANCELLED')
  })

  it('maps tracking_number and tracking_company', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.trackingNumber).toBe('VN123456789')
    expect(result.carrier).toBe('Viettel Post')
    expect(result.trackingUrl).toBe('https://track.viettelpost.vn/VN123456789')
  })

  it('falls back to tracking_numbers array when singular field is absent', () => {
    const result = transformFulfillment(
      makeFulfillment({
        tracking_number: null,
        tracking_numbers: ['VN999'],
        tracking_url: null,
        tracking_urls: ['https://track.example.com/VN999'],
      }),
    )
    expect(result.trackingNumber).toBe('VN999')
    expect(result.trackingUrl).toBe('https://track.example.com/VN999')
  })

  it('maps location_id → locationId as string', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.locationId).toBe('44')
  })

  it('maps line_items to canonical lineItems', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0]!.lineItemId).toBe('201')
    expect(result.lineItems![0]!.quantity).toBe(2)
  })

  it('maps created_on → createdAt and modified_on → updatedAt', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.createdAt).toBe('2024-04-01T07:00:00Z')
    expect(result.updatedAt).toBe('2024-04-02T12:00:00Z')
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
    const raw = untransformFulfillment(canonical)
    expect(raw.tracking_number).toBe('VN123456789')
    expect(raw.tracking_company).toBe('Viettel Post')
    expect(raw.location_id).toBe('44')
  })
})
