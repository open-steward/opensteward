import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawWixFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/wix/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeFulfillment(overrides: Partial<RawWixFulfillment> = {}): RawWixFulfillment {
  return {
    id: 'ful-001',
    orderId: 'order-001',
    status: 'FULFILLED',
    trackingInfo: {
      trackingNumber: 'TRACK-123',
      trackingLink: 'https://track.example.com/TRACK-123',
      shippingProvider: 'FedEx',
    },
    lineItems: [
      { id: 'li-001', quantity: 2 },
    ],
    createdDate: '2024-01-17T10:00:00Z',
    ...overrides,
  }
}

describe('transformFulfillment', () => {
  it('maps core fields', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.id).toBe('ful-001')
    expect(result.orderId).toBe('order-001')
    expect(result.status).toBe('SUCCESS')
    expect(result.trackingNumber).toBe('TRACK-123')
    expect(result.trackingUrl).toBe('https://track.example.com/TRACK-123')
    expect(result.carrier).toBe('FedEx')
  })

  it('maps line items', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.lineItemId).toBe('li-001')
    expect(result.lineItems![0]!.quantity).toBe(2)
  })

  it('uses provided orderId when raw does not have one', () => {
    const result = transformFulfillment(makeFulfillment({ orderId: undefined }), 'order-ext')
    expect(result.orderId).toBe('order-ext')
  })

  it('maps CANCELLED status', () => {
    const result = transformFulfillment(makeFulfillment({ status: 'CANCELLED' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps PENDING status', () => {
    const result = transformFulfillment(makeFulfillment({ status: 'PENDING' }))
    expect(result.status).toBe('PENDING')
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
    expect(raw.orderId).toBe('order-001')
    expect((raw.trackingInfo as Record<string, unknown>).trackingNumber).toBe('TRACK-123')
    expect((raw.trackingInfo as Record<string, unknown>).shippingProvider).toBe('FedEx')
  })
})
