import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawVendureFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/vendure/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeFulfillment(overrides: Partial<RawVendureFulfillment> = {}): RawVendureFulfillment {
  return {
    id: 'F1',
    state: 'Shipped',
    trackingCode: '1Z999AA10123456784',
    method: 'DHL Express',
    lines: [
      { orderLineId: 'LINE1', quantity: 2 },
    ],
    createdAt: '2024-05-02T10:00:00Z',
    updatedAt: '2024-05-02T12:00:00Z',
    ...overrides,
  }
}

describe('transformFulfillment (Vendure)', () => {
  it('maps core fields', () => {
    const result = transformFulfillment(makeFulfillment(), 'ORD1')
    expect(result.id).toBe('F1')
    expect(result.orderId).toBe('ORD1')
    expect(result.status).toBe('SUCCESS')
    expect(result.trackingNumber).toBe('1Z999AA10123456784')
    expect(result.carrier).toBe('DHL Express')
  })

  it('maps status correctly', () => {
    expect(transformFulfillment(makeFulfillment({ state: 'Pending' })).status).toBe('PENDING')
    expect(transformFulfillment(makeFulfillment({ state: 'Shipped' })).status).toBe('SUCCESS')
    expect(transformFulfillment(makeFulfillment({ state: 'Delivered' })).status).toBe('SUCCESS')
    expect(transformFulfillment(makeFulfillment({ state: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('maps line items', () => {
    const result = transformFulfillment(makeFulfillment(), 'ORD1')
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.lineItemId).toBe('LINE1')
    expect(result.lineItems![0]!.quantity).toBe(2)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeFulfillment()
    const result = transformFulfillment(raw, 'ORD1')
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeFulfillment(), 'ORD1')
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformFulfillment', () => {
    const canonical = transformFulfillment(makeFulfillment(), 'ORD1')
    const raw = untransformFulfillment(canonical)
    expect(raw['trackingCode']).toBe('1Z999AA10123456784')
    expect(raw['method']).toBe('DHL Express')
  })
})
