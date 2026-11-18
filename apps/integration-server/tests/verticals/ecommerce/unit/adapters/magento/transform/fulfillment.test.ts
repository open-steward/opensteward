import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawMagentoShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/magento/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeShipment(overrides: Partial<RawMagentoShipment> = {}): RawMagentoShipment {
  return {
    entity_id: 5001,
    order_id: 1001,
    increment_id: '000000456',
    total_qty: 2,
    created_at: '2024-05-02T09:00:00.000Z',
    updated_at: '2024-05-02T09:00:00.000Z',
    tracks: [
      {
        entity_id: 900,
        track_number: '1Z999AA10123456784',
        title: 'UPS Ground',
        carrier_code: 'ups',
        order_id: 1001,
      },
    ],
    items: [
      { entity_id: 1, order_item_id: 9001, qty: 2, sku: 'TEE-OCEAN-BLUE-S', name: 'Ocean Blue Tee' },
    ],
    ...overrides,
  }
}

describe('transformFulfillment (Magento)', () => {
  it('maps core fields and sets status to SUCCESS', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.id).toBe('5001')
    expect(typeof result.id).toBe('string')
    expect(result.orderId).toBe('1001')
    expect(result.status).toBe('SUCCESS')
    expect(result.trackingNumber).toBe('1Z999AA10123456784')
    expect(result.carrier).toBe('ups')
  })

  it('maps line items by order_item_id', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.lineItems).toEqual([{ lineItemId: '9001', quantity: 2 }])
  })

  it('handles shipments without tracking or items', () => {
    const result = transformFulfillment(
      makeShipment({ tracks: [], items: [] }),
    )
    expect(result.trackingNumber).toBeUndefined()
    expect(result.lineItems).toBeUndefined()
  })

  it('preserves raw payload in metadata unmodified', () => {
    const raw = makeShipment()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeShipment())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformFulfillment', () => {
    const canonical = transformFulfillment(makeShipment())
    const body = untransformFulfillment(canonical)
    const items = body['items'] as Array<{ order_item_id: number; qty: number }>
    expect(items[0]!.order_item_id).toBe(9001)
    expect(items[0]!.qty).toBe(2)
    const tracks = body['tracks'] as Array<{ track_number: string; carrier_code: string }>
    expect(tracks[0]!.track_number).toBe('1Z999AA10123456784')
  })
})
