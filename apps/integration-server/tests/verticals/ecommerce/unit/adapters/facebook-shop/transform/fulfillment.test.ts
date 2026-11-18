import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  transformFulfillments,
  untransformFulfillment,
  type RawFacebookShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/facebook-shop/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeShipment(
  overrides: Partial<RawFacebookShipment> = {},
): RawFacebookShipment {
  return {
    id: 'SHIP-001',
    tracking_info: {
      tracking_number: '1Z999AA10123456784',
      carrier: 'UPS',
      shipping_method_name: 'Ground',
    },
    items: [
      { item_id: 'ITEM-001', quantity: 2 },
    ],
    ...overrides,
  }
}

describe('transformFulfillment (Facebook Shop)', () => {
  it('uses shipment id as the canonical id and maps carrier/tracking', () => {
    const f = transformFulfillment('FB-ORD-12345', makeShipment())
    expect(f.id).toBe('SHIP-001')
    expect(f.orderId).toBe('FB-ORD-12345')
    expect(f.trackingNumber).toBe('1Z999AA10123456784')
    expect(f.carrier).toBe('UPS')
    expect(f.status).toBe('SUCCESS')
  })

  it('infers PENDING status when no tracking number', () => {
    const f = transformFulfillment(
      'O1',
      makeShipment({ tracking_info: {} }),
    )
    expect(f.status).toBe('PENDING')
  })

  it('maps line items correctly', () => {
    const f = transformFulfillment('O1', makeShipment())
    expect(f.lineItems).toHaveLength(1)
    expect(f.lineItems![0]).toEqual({ lineItemId: 'ITEM-001', quantity: 2 })
  })

  it('emits one canonical fulfillment per Facebook shipment', () => {
    const list = transformFulfillments('O2', [
      makeShipment({ id: 'S1' }),
      makeShipment({ id: 'S2', tracking_info: undefined }),
    ])
    expect(list).toHaveLength(2)
    expect(list[0]!.id).toBe('S1')
    expect(list[0]!.status).toBe('SUCCESS')
    expect(list[1]!.id).toBe('S2')
    expect(list[1]!.status).toBe('PENDING')
  })

  it('returns empty array for undefined items', () => {
    expect(transformFulfillments('O3', undefined)).toEqual([])
    expect(transformFulfillments('O3', [])).toEqual([])
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const f = transformFulfillment('O4', makeShipment())
    expect(() => FulfillmentSchema.parse(f)).not.toThrow()
  })

  it('round-trips via untransformFulfillment', () => {
    const canonical = transformFulfillment('O5', makeShipment())
    const body = untransformFulfillment(canonical)
    const tracking = body['tracking_info'] as Record<string, unknown>
    expect(tracking['tracking_number']).toBe('1Z999AA10123456784')
    expect(tracking['carrier']).toBe('UPS')
    expect(body['items']).toEqual([{ item_id: 'ITEM-001', quantity: 2 }])
  })
})
