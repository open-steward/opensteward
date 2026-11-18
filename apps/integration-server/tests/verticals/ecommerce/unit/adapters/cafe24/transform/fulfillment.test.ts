import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawCafe24Shipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/cafe24/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

describe('transformFulfillment (cafe24)', () => {
  const raw: RawCafe24Shipment = {
    shipping_code: 'SHP-001',
    order_id: '20240301-0000001',
    status: 'delivering',
    tracking_no: 'CAFE-TRACK-001',
    carrier_id: 'cj',
    carrier_name: 'CJ Logistics',
    items: [
      { order_item_code: 'ITEM-001', quantity: 2 },
      { order_item_code: 'ITEM-002', quantity: 1 },
    ],
    created_date: '2024-03-01T00:00:00Z',
    updated_date: '2024-03-01T00:00:00Z',
  }

  it('synthesises id as orderId:shippingCode', () => {
    expect(transformFulfillment(raw).id).toBe('20240301-0000001:SHP-001')
  })

  it('maps orderId', () => {
    expect(transformFulfillment(raw).orderId).toBe('20240301-0000001')
  })

  it('maps status delivering → SUCCESS', () => {
    expect(transformFulfillment(raw).status).toBe('SUCCESS')
  })

  it('maps status standby → PENDING', () => {
    expect(transformFulfillment({ ...raw, status: 'standby' }).status).toBe('PENDING')
  })

  it('maps status prepare → OPEN', () => {
    expect(transformFulfillment({ ...raw, status: 'prepare' }).status).toBe('OPEN')
  })

  it('maps status delivery_complete → SUCCESS', () => {
    expect(transformFulfillment({ ...raw, status: 'delivery_complete' }).status).toBe('SUCCESS')
  })

  it('maps tracking number', () => {
    expect(transformFulfillment(raw).trackingNumber).toBe('CAFE-TRACK-001')
  })

  it('maps carrier from carrier_name', () => {
    expect(transformFulfillment(raw).carrier).toBe('CJ Logistics')
  })

  it('falls back to carrier_id when carrier_name absent', () => {
    const result = transformFulfillment({ ...raw, carrier_name: null })
    expect(result.carrier).toBe('cj')
  })

  it('maps line items with order_item_code and quantity', () => {
    const result = transformFulfillment(raw)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0]!.lineItemId).toBe('ITEM-001')
    expect(result.lineItems![0]!.quantity).toBe(2)
    expect(result.lineItems![1]!.lineItemId).toBe('ITEM-002')
    expect(result.lineItems![1]!.quantity).toBe(1)
  })

  it('maps createdAt', () => {
    // toIsoDatetime normalizes to include milliseconds
    expect(transformFulfillment(raw).createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('passes FulfillmentSchema validation', () => {
    expect(() => FulfillmentSchema.parse(transformFulfillment(raw))).not.toThrow()
  })

  it('handles cancelled status', () => {
    expect(transformFulfillment({ ...raw, status: 'cancelled' }).status).toBe('CANCELLED')
  })

  it('handles null items', () => {
    const result = transformFulfillment({ ...raw, items: undefined })
    expect(result.lineItems).toBeUndefined()
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})

describe('untransformFulfillment (cafe24)', () => {
  it('round-trips tracking_no and carrier_id', () => {
    const canonical = transformFulfillment({
      shipping_code: 'S1',
      order_id: 'O1',
      tracking_no: 'TRK-999',
      carrier_name: 'Korea Post',
    })
    const body = untransformFulfillment(canonical)
    expect(body.tracking_no).toBe('TRK-999')
    expect(body.carrier_id).toBe('Korea Post')
  })
})
