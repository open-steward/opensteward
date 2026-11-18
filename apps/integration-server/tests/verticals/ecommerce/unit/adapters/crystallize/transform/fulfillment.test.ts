import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawCrystallizeFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/crystallize/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeFulfillment(overrides: Partial<RawCrystallizeFulfillment> = {}): RawCrystallizeFulfillment {
  return {
    id: 'ful-001',
    orderId: 'order-001',
    status: 'shipped',
    trackingNumber: '1Z999AA1',
    carrier: 'UPS',
    lineItems: [
      { lineItemId: 'LINE1', quantity: 2 },
    ],
    createdAt: '2024-05-02T08:00:00.000Z',
    ...overrides,
  }
}

describe('transformFulfillment (Crystallize)', () => {
  it('maps core fields', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.id).toBe('ful-001')
    expect(result.orderId).toBe('order-001')
    expect(result.trackingNumber).toBe('1Z999AA1')
    expect(result.carrier).toBe('UPS')
  })

  it('maps status correctly', () => {
    expect(transformFulfillment(makeFulfillment({ status: 'shipped' })).status).toBe('SUCCESS')
    expect(transformFulfillment(makeFulfillment({ status: 'delivered' })).status).toBe('SUCCESS')
    expect(transformFulfillment(makeFulfillment({ status: 'pending' })).status).toBe('PENDING')
    expect(transformFulfillment(makeFulfillment({ status: 'processing' })).status).toBe('OPEN')
    expect(transformFulfillment(makeFulfillment({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps line items', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.lineItemId).toBe('LINE1')
    expect(result.lineItems![0]!.quantity).toBe(2)
  })

  it('uses orderId override', () => {
    const result = transformFulfillment(makeFulfillment({ orderId: '' }), 'override-order')
    expect(result.orderId).toBe('override-order')
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
    expect(raw['trackingNumber']).toBe('1Z999AA1')
    expect(raw['carrier']).toBe('UPS')
  })
})
