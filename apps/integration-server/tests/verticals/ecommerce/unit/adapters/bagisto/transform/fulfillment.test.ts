import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  type BagistoShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/bagisto/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeShipment(overrides: Partial<BagistoShipment> = {}): BagistoShipment {
  return {
    id: 7,
    order_id: 456,
    carrier_title: 'FedEx',
    track_number: '7489234980234',
    track_url: 'https://www.fedex.com/fedextrack/?trknbr=7489234980234',
    total_qty: 2,
    items: [
      {
        id: 1,
        order_item_id: 101,
        name: 'Wireless Keyboard',
        sku: 'PROD-001',
        qty: 2,
      },
    ],
    inventory_source: { id: 1, name: 'Default Warehouse' },
    created_at: '2024-01-17T09:00:00.000Z',
    updated_at: '2024-01-17T10:00:00.000Z',
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('transformFulfillment (Bagisto)', () => {
  it('maps id to string', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.id).toBe('7')
    expect(typeof result.id).toBe('string')
  })

  it('maps orderId to string', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.orderId).toBe('456')
  })

  it('maps track_number as trackingNumber', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.trackingNumber).toBe('7489234980234')
  })

  it('maps track_url as trackingUrl', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.trackingUrl).toBe('https://www.fedex.com/fedextrack/?trknbr=7489234980234')
  })

  it('maps carrier_title as carrier', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.carrier).toBe('FedEx')
  })

  it('maps status as SUCCESS when track_number present', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.status).toBe('SUCCESS')
  })

  it('maps status as OPEN when track_number is absent', () => {
    const result = transformFulfillment(makeShipment({ track_number: null }))
    expect(result.status).toBe('OPEN')
  })

  it('maps inventory_source id as locationId', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.locationId).toBe('1')
  })

  it('defaults locationId to undefined when no inventory_source', () => {
    const result = transformFulfillment(makeShipment({ inventory_source: null }))
    expect(result.locationId).toBeUndefined()
  })

  it('maps line items using order_item_id as lineItemId', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]).toMatchObject({ lineItemId: '101', quantity: 2 })
  })

  it('handles multiple line items', () => {
    const result = transformFulfillment(
      makeShipment({
        items: [
          { id: 1, order_item_id: 101, qty: 2 },
          { id: 2, order_item_id: 102, qty: 1 },
        ],
      }),
    )
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![1]).toMatchObject({ lineItemId: '102', quantity: 1 })
  })

  it('handles empty items array', () => {
    const result = transformFulfillment(makeShipment({ items: [] }))
    expect(result.lineItems).toBeUndefined()
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.createdAt).toBe('2024-01-17T09:00:00.000Z')
    expect(result.updatedAt).toBe('2024-01-17T10:00:00.000Z')
  })

  it('handles null carrier_title gracefully', () => {
    const result = transformFulfillment(makeShipment({ carrier_title: null }))
    expect(result.carrier).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeShipment()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeShipment())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('handles shipment with no order_id', () => {
    const result = transformFulfillment(makeShipment({ order_id: undefined }))
    expect(result.orderId).toBe('unknown')
  })
})
