import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  transformFulfillments,
  untransformFulfillment,
  type RawEbayShippingFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/ebay/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeFulfillment(
  overrides: Partial<RawEbayShippingFulfillment> = {},
): RawEbayShippingFulfillment {
  return {
    fulfillmentId: 'FUL-001',
    shipmentTrackingNumber: '1Z999AA10123456784',
    shippingCarrierCode: 'UPS',
    shippedDate: '2024-05-02T14:00:00.000Z',
    lineItems: [
      { lineItemId: 'LI-001', quantity: 2 },
    ],
    ...overrides,
  }
}

describe('transformFulfillment (eBay)', () => {
  it('uses fulfillmentId as the canonical id and maps carrier/tracking', () => {
    const f = transformFulfillment('04-12345-67890', makeFulfillment())
    expect(f.id).toBe('FUL-001')
    expect(f.orderId).toBe('04-12345-67890')
    expect(f.trackingNumber).toBe('1Z999AA10123456784')
    expect(f.carrier).toBe('UPS')
    expect(f.status).toBe('SUCCESS')
  })

  it('infers PENDING status when no shippedDate', () => {
    const f = transformFulfillment(
      'O1',
      makeFulfillment({ shippedDate: undefined }),
    )
    expect(f.status).toBe('PENDING')
  })

  it('maps line items correctly', () => {
    const f = transformFulfillment('O1', makeFulfillment())
    expect(f.lineItems).toHaveLength(1)
    expect(f.lineItems![0]).toEqual({ lineItemId: 'LI-001', quantity: 2 })
  })

  it('emits one canonical fulfillment per eBay shipping fulfillment', () => {
    const list = transformFulfillments('O2', [
      makeFulfillment({ fulfillmentId: 'F1' }),
      makeFulfillment({ fulfillmentId: 'F2', shippedDate: undefined }),
    ])
    expect(list).toHaveLength(2)
    expect(list[0]!.id).toBe('F1')
    expect(list[0]!.status).toBe('SUCCESS')
    expect(list[1]!.id).toBe('F2')
    expect(list[1]!.status).toBe('PENDING')
  })

  it('returns empty array for undefined items', () => {
    expect(transformFulfillments('O3', undefined)).toEqual([])
    expect(transformFulfillments('O3', [])).toEqual([])
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const f = transformFulfillment('O4', makeFulfillment())
    expect(() => FulfillmentSchema.parse(f)).not.toThrow()
  })

  it('round-trips via untransformFulfillment', () => {
    const canonical = transformFulfillment('O5', makeFulfillment())
    const body = untransformFulfillment(canonical)
    expect(body['shipmentTrackingNumber']).toBe('1Z999AA10123456784')
    expect(body['shippingCarrierCode']).toBe('UPS')
    expect(body['lineItems']).toEqual([{ lineItemId: 'LI-001', quantity: 2 }])
  })
})
