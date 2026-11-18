import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawWishFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/wish/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeFulfillment(overrides: Partial<RawWishFulfillment> = {}): RawWishFulfillment {
  return {
    order_id: 'order-123',
    state: 'shipped',
    tracking_provider: 'USPS',
    tracking_number: '9400111899223397910716',
    tracking_url: 'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223397910716',
    last_updated: '2024-06-15T10:00:00Z',
    created_time: '2024-06-10T08:00:00Z',
    ...overrides,
  }
}

describe('transformFulfillment (Wish)', () => {
  it('maps order_id to id and orderId', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.id).toBe('order-123')
    expect(result.orderId).toBe('order-123')
  })

  it('maps state=shipped to SUCCESS status', () => {
    const result = transformFulfillment(makeFulfillment({ state: 'shipped' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps state=completed to SUCCESS status', () => {
    const result = transformFulfillment(makeFulfillment({ state: 'completed' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps state=approved to PENDING status', () => {
    const result = transformFulfillment(makeFulfillment({ state: 'approved' }))
    expect(result.status).toBe('PENDING')
  })

  it('maps state=refunded to CANCELLED status', () => {
    const result = transformFulfillment(makeFulfillment({ state: 'refunded' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps unknown state to undefined status', () => {
    const result = transformFulfillment(makeFulfillment({ state: 'unknown_state' }))
    expect(result.status).toBeUndefined()
  })

  it('maps tracking_provider to carrier', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.carrier).toBe('USPS')
  })

  it('maps tracking_number', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.trackingNumber).toBe('9400111899223397910716')
  })

  it('maps tracking_url', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.trackingUrl).toBe(
      'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223397910716',
    )
  })

  it('maps last_updated ISO string to updatedAt', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.updatedAt).toBe('2024-06-15T10:00:00.000Z')
  })

  it('maps created_time ISO string to createdAt', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.createdAt).toBe('2024-06-10T08:00:00.000Z')
  })

  it('handles null tracking fields gracefully', () => {
    const result = transformFulfillment(
      makeFulfillment({
        tracking_provider: null,
        tracking_number: null,
        tracking_url: null,
      }),
    )
    expect(result.carrier).toBeUndefined()
    expect(result.trackingNumber).toBeUndefined()
    expect(result.trackingUrl).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeFulfillment()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying FulfillmentSchema', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})

describe('untransformFulfillment (Wish)', () => {
  it('maps orderId to order_id', () => {
    const body = untransformFulfillment({ orderId: 'order-123' })
    expect(body['order_id']).toBe('order-123')
  })

  it('maps carrier to tracking_provider', () => {
    const body = untransformFulfillment({ carrier: 'FedEx' })
    expect(body['tracking_provider']).toBe('FedEx')
  })

  it('maps trackingNumber to tracking_number', () => {
    const body = untransformFulfillment({ trackingNumber: '1234567890' })
    expect(body['tracking_number']).toBe('1234567890')
  })
})
