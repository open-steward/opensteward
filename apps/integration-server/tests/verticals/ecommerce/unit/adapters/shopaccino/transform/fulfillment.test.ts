import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawShopifyFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopaccino/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeRaw(overrides: Partial<RawShopifyFulfillment> = {}): RawShopifyFulfillment {
  return {
    id: 1001,
    order_id: 5001,
    status: 'success',
    tracking_number: 'TRACK123',
    tracking_url: 'https://track.example.com/TRACK123',
    tracking_company: 'DHL',
    service: 'express',
    location_id: 7001,
    line_items: [
      { id: 101, quantity: 2 },
      { id: 102, quantity: 1 },
    ],
    notify_customer: true,
    created_at: '2024-04-01T10:00:00.000Z',
    updated_at: '2024-04-02T08:00:00.000Z',
    ...overrides,
  }
}

describe('shopaccino transformFulfillment', () => {
  it('maps id and orderId to strings', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.id).toBe('1001')
    expect(result.orderId).toBe('5001')
  })

  it('maps status via STATUS_MAP (success → SUCCESS)', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.status).toBe('SUCCESS')
  })

  it('maps cancelled status (cancelled → CANCELLED)', () => {
    const result = transformFulfillment(makeRaw({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps carrier and trackingNumber', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.carrier).toBe('DHL')
    expect(result.trackingNumber).toBe('TRACK123')
  })

  it('maps line items to canonical FulfillmentLineItem shape', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0]).toEqual({ lineItemId: '101', quantity: 2 })
    expect(result.lineItems![1]).toEqual({ lineItemId: '102', quantity: 1 })
  })

  it('produces output that passes FulfillmentSchema', () => {
    const result = transformFulfillment(makeRaw())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformFulfillment', () => {
    const canonical = transformFulfillment(makeRaw())
    const back = untransformFulfillment(canonical)
    expect(back.tracking_number).toBe('TRACK123')
    expect(back.tracking_company).toBe('DHL')
  })
})
