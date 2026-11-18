import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawCartpandaFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/cartpanda/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeFulfillment(
  overrides: Partial<RawCartpandaFulfillment> = {},
): RawCartpandaFulfillment {
  return {
    id: 101,
    order_id: 9001,
    status: 'success',
    tracking_number: 'BR123456789BR',
    tracking_url: 'https://track.example.com/BR123456789BR',
    tracking_company: 'Correios',
    service: 'PAC',
    location_id: 55,
    line_items: [{ id: 201, quantity: 2 }],
    notify_customer: true,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('transformFulfillment', () => {
  it('maps id and orderId to strings', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.id).toBe('101')
    expect(result.orderId).toBe('9001')
  })

  it('maps status "success" to SUCCESS', () => {
    const result = transformFulfillment(makeFulfillment({ status: 'success' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps status "cancelled" and "canceled" to CANCELLED', () => {
    expect(transformFulfillment(makeFulfillment({ status: 'cancelled' })).status).toBe('CANCELLED')
    expect(transformFulfillment(makeFulfillment({ status: 'canceled' })).status).toBe('CANCELLED')
  })

  it('maps tracking fields', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.trackingNumber).toBe('BR123456789BR')
    expect(result.trackingUrl).toBe('https://track.example.com/BR123456789BR')
    expect(result.carrier).toBe('Correios')
    expect(result.service).toBe('PAC')
  })

  it('maps locationId to string', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.locationId).toBe('55')
  })

  it('maps line items with string lineItemId', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.lineItemId).toBe('201')
    expect(result.lineItems![0]!.quantity).toBe(2)
  })

  it('returns undefined lineItems for empty array', () => {
    const result = transformFulfillment(makeFulfillment({ line_items: [] }))
    expect(result.lineItems).toBeUndefined()
  })

  it('maps unknown status to undefined', () => {
    const result = transformFulfillment(makeFulfillment({ status: 'unknown_status' }))
    expect(result.status).toBeUndefined()
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformFulfillment', () => {
    const canonical = transformFulfillment(makeFulfillment())
    const raw = untransformFulfillment(canonical)
    expect(raw.tracking_number).toBe('BR123456789BR')
    expect(raw.tracking_company).toBe('Correios')
    expect(raw.location_id).toBe('55')
  })
})
