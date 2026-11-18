import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawSaleorFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/saleor/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeFulfillment(overrides: Partial<RawSaleorFulfillment> = {}): RawSaleorFulfillment {
  return {
    id: 'RnVsZmlsbG1lbnQ6MQ==',
    status: 'FULFILLED',
    trackingNumber: '1Z999AA10123456784',
    fulfillmentOrder: 1,
    lines: [
      { id: 'FL1', quantity: 2, orderLine: { id: 'OL1' } },
    ],
    warehouse: { id: 'WH1' },
    created: '2024-05-02T10:00:00Z',
    ...overrides,
  }
}

describe('transformFulfillment (Saleor)', () => {
  it('maps core fields', () => {
    const result = transformFulfillment(makeFulfillment(), 'ORDER1')
    expect(result.id).toBe('RnVsZmlsbG1lbnQ6MQ==')
    expect(result.orderId).toBe('ORDER1')
    expect(result.status).toBe('SUCCESS')
    expect(result.trackingNumber).toBe('1Z999AA10123456784')
    expect(result.locationId).toBe('WH1')
  })

  it('maps line items', () => {
    const result = transformFulfillment(makeFulfillment(), 'ORDER1')
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.lineItemId).toBe('OL1')
    expect(result.lineItems![0]!.quantity).toBe(2)
  })

  it('maps CANCELED status', () => {
    const result = transformFulfillment(makeFulfillment({ status: 'CANCELED' }), 'ORDER1')
    expect(result.status).toBe('CANCELLED')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeFulfillment()
    const result = transformFulfillment(raw, 'ORDER1')
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeFulfillment(), 'ORDER1')
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformFulfillment', () => {
    const canonical = transformFulfillment(makeFulfillment(), 'ORDER1')
    const raw = untransformFulfillment(canonical)
    expect(raw['trackingNumber']).toBe('1Z999AA10123456784')
  })
})
