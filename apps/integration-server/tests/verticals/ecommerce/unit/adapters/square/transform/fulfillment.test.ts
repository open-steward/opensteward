import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawSquareFulfillmentEntry,
} from '../../../../../../../src/verticals/ecommerce/adapters/square/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeFulfillment(overrides: Partial<RawSquareFulfillmentEntry> = {}): RawSquareFulfillmentEntry {
  return {
    uid: 'FUL_001',
    type: 'SHIPMENT',
    state: 'COMPLETED',
    shipment_details: {
      carrier: 'USPS',
      tracking_number: '9400111899223',
      tracking_url: 'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223',
      placed_at: '2024-05-02T09:00:00Z',
      shipped_at: '2024-05-03T10:00:00Z',
      delivered_at: '2024-05-05T14:00:00Z',
    },
    entries: [
      { line_item_uid: 'LI_001', quantity: '2' },
    ],
    ...overrides,
  }
}

describe('transformFulfillment (Square)', () => {
  it('maps core fields with composite id', () => {
    const result = transformFulfillment(makeFulfillment(), 'ORDER_001')
    expect(result.id).toBe('ORDER_001:FUL_001')
    expect(result.orderId).toBe('ORDER_001')
    expect(result.status).toBe('SUCCESS')
    expect(result.carrier).toBe('USPS')
    expect(result.trackingNumber).toBe('9400111899223')
    expect(result.service).toBe('SHIPMENT')
  })

  it('maps shipment dates', () => {
    const result = transformFulfillment(makeFulfillment(), 'ORDER_001')
    expect(result.shippedAt).toBe('2024-05-03T10:00:00Z')
    expect(result.deliveredAt).toBe('2024-05-05T14:00:00Z')
  })

  it('maps line item entries', () => {
    const result = transformFulfillment(makeFulfillment(), 'ORDER_001')
    expect(result.lineItems).toEqual([{ lineItemId: 'LI_001', quantity: 2 }])
  })

  it('maps CANCELED state', () => {
    const result = transformFulfillment(makeFulfillment({ state: 'CANCELED' }), 'ORDER_001')
    expect(result.status).toBe('CANCELLED')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeFulfillment()
    const result = transformFulfillment(raw, 'ORDER_001')
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeFulfillment(), 'ORDER_001')
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformFulfillment', () => {
    const canonical = transformFulfillment(makeFulfillment(), 'ORDER_001')
    const raw = untransformFulfillment(canonical)
    expect(raw['type']).toBe('SHIPMENT')
    expect((raw['shipment_details'] as Record<string, unknown>)['carrier']).toBe('USPS')
  })
})
