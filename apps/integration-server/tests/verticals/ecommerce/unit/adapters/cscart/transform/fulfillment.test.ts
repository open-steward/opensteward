import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  type CsCartShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/cscart/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeShipment(overrides: Partial<CsCartShipment> = {}): CsCartShipment {
  return {
    shipment_id: 77,
    order_id: 456,
    shipping_id: 3,
    carrier: 'UPS',
    tracking_number: '1Z999AA10123456784',
    timestamp: 1704067200,
    status: 'P',
    products: [
      { item_id: 901, amount: 2 },
      { item_id: 902, amount: 1 },
    ],
    ...overrides,
  }
}

describe('transformFulfillment (CS-Cart)', () => {
  it('maps core fields and stringifies shipment_id and order_id', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.id).toBe('77')
    expect(typeof result.id).toBe('string')
    expect(result.orderId).toBe('456')
    expect(typeof result.orderId).toBe('string')
  })

  it('maps carrier and tracking number', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.carrier).toBe('UPS')
    expect(result.trackingNumber).toBe('1Z999AA10123456784')
  })

  it('maps status P → SUCCESS', () => {
    expect(transformFulfillment(makeShipment({ status: 'P' })).status).toBe('SUCCESS')
  })

  it('maps status D → SUCCESS', () => {
    expect(transformFulfillment(makeShipment({ status: 'D' })).status).toBe('SUCCESS')
  })

  it('maps status A → OPEN', () => {
    expect(transformFulfillment(makeShipment({ status: 'A' })).status).toBe('OPEN')
  })

  it('maps status C → CANCELLED', () => {
    expect(transformFulfillment(makeShipment({ status: 'C' })).status).toBe('CANCELLED')
  })

  it('maps missing/unknown status → PENDING', () => {
    expect(transformFulfillment(makeShipment({ status: undefined })).status).toBe('PENDING')
    expect(transformFulfillment(makeShipment({ status: 'X' })).status).toBe('PENDING')
  })

  it('maps line items with correct ids and quantities', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0]).toEqual({ lineItemId: '901', quantity: 2 })
    expect(result.lineItems![1]).toEqual({ lineItemId: '902', quantity: 1 })
  })

  it('converts Unix timestamp to ISO string for shippedAt and createdAt', () => {
    const result = transformFulfillment(makeShipment())
    const expected = new Date(1704067200 * 1000).toISOString()
    expect(result.shippedAt).toBe(expected)
    expect(result.createdAt).toBe(expected)
  })

  it('handles missing products gracefully with empty lineItems', () => {
    const result = transformFulfillment(makeShipment({ products: undefined }))
    expect(result.lineItems).toEqual([])
  })

  it('handles missing tracking number gracefully', () => {
    const result = transformFulfillment(makeShipment({ tracking_number: null }))
    expect(result.trackingNumber).toBeUndefined()
  })

  it('defaults amount to 1 when missing from line item', () => {
    const result = transformFulfillment(
      makeShipment({ products: [{ item_id: 901 }] }),
    )
    expect(result.lineItems![0]!.quantity).toBe(1)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeShipment()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces output that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeShipment())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})
