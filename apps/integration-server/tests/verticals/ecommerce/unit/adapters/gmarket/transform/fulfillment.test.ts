import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  transformFulfillments,
  untransformFulfillment,
  type RawGmarketFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/gmarket/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeFulfillment(
  overrides: Partial<RawGmarketFulfillment> = {},
): RawGmarketFulfillment {
  return {
    fulfillmentNo: 'FUL-001',
    orderNo: 'ORD-2024-001',
    trackingNo: '1234567890',
    carrierCode: 'CJ',
    carrierName: 'CJ대한통운',
    shippedDate: '2024-06-02T09:00:00.000Z',
    deliveredDate: '2024-06-03T14:00:00.000Z',
    status: 'SHIPPED',
    lineItems: [
      { orderItemNo: 'LI-001', quantity: 1 },
    ],
    ...overrides,
  }
}

describe('transformFulfillment (Gmarket)', () => {
  it('maps core fields and uses fulfillmentNo as the canonical id', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.id).toBe('FUL-001')
    expect(result.orderId).toBe('ORD-2024-001')
    expect(result.trackingNumber).toBe('1234567890')
    expect(result.carrier).toBe('CJ대한통운')
  })

  it('maps SHIPPED to SUCCESS and READY to PENDING', () => {
    expect(transformFulfillment(makeFulfillment({ status: 'SHIPPED' })).status).toBe('SUCCESS')
    expect(transformFulfillment(makeFulfillment({ status: 'DELIVERED' })).status).toBe('SUCCESS')
    expect(transformFulfillment(makeFulfillment({ status: 'READY' })).status).toBe('PENDING')
    expect(transformFulfillment(makeFulfillment({ status: 'CANCELLED' })).status).toBe('CANCELLED')
  })

  it('maps line items with orderItemNo as lineItemId', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]).toEqual({ lineItemId: 'LI-001', quantity: 1 })
  })

  it('transformFulfillments handles empty array', () => {
    expect(transformFulfillments([])).toEqual([])
    expect(transformFulfillments(undefined)).toEqual([])
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformFulfillment', () => {
    const canonical = transformFulfillment(makeFulfillment())
    const body = untransformFulfillment(canonical)
    expect(body['orderNo']).toBe('ORD-2024-001')
    expect(body['trackingNo']).toBe('1234567890')
    expect(body['carrierCode']).toBe('CJ대한통운')
  })
})
