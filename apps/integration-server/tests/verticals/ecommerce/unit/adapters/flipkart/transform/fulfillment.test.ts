import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  transformFulfillments,
  type RawFlipkartShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/flipkart/transform/fulfillment'
import type { RawFlipkartOrderItem } from '../../../../../../../src/verticals/ecommerce/adapters/flipkart/transform/order'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeItem(overrides: Partial<RawFlipkartOrderItem> = {}): RawFlipkartOrderItem {
  return {
    order_item_id: 'OI-FK-001',
    order_id: 'OD-FK-1234567890',
    listing_id: 'LSTSHRT001',
    sku_id: 'SKU-POLO-BLU-M',
    title: 'Blue Polo T-Shirt',
    quantity: 2,
    selling_price: { amount: 699, currency_code: 'INR' },
    order_item_status: 'SHIPPED',
    fulfillment_type: 'FLIPKART',
    ...overrides,
  }
}

function makeShipment(overrides: Partial<RawFlipkartShipment> = {}): RawFlipkartShipment {
  return {
    shipment_id: 'SHP-FK-001',
    order_item_id: 'OI-FK-001',
    order_id: 'OD-FK-1234567890',
    tracking_id: 'FKMP12345678',
    carrier: 'Ekart Logistics',
    dispatch_date: '2024-06-02T08:00:00Z',
    status: 'IN_TRANSIT',
    ...overrides,
  }
}

describe('transformFulfillment (Flipkart)', () => {
  it('uses shipment_id when shipment info is available', () => {
    const f = transformFulfillment('OD-FK-1234567890', makeItem(), makeShipment())
    expect(f.id).toBe('SHP-FK-001')
    expect(f.orderId).toBe('OD-FK-1234567890')
    expect(f.trackingNumber).toBe('FKMP12345678')
    expect(f.carrier).toBe('Ekart Logistics')
  })

  it('falls back to composite id when no shipment info', () => {
    const f = transformFulfillment('OD-FK-1234567890', makeItem())
    expect(f.id).toBe('OD-FK-1234567890:OI-FK-001')
  })

  it('maps FLIPKART fulfillment type to Flipkart Assured service', () => {
    const f = transformFulfillment('OD-FK-1234567890', makeItem())
    expect(f.service).toBe('Flipkart Assured')
  })

  it('maps order item status to canonical fulfillment status', () => {
    expect(transformFulfillment('O1', makeItem({ order_item_status: 'DELIVERED' })).status).toBe('SUCCESS')
    expect(transformFulfillment('O1', makeItem({ order_item_status: 'SHIPPED' })).status).toBe('OPEN')
    expect(transformFulfillment('O1', makeItem({ order_item_status: 'READY_TO_DISPATCH' })).status).toBe('OPEN')
    expect(transformFulfillment('O1', makeItem({ order_item_status: 'APPROVED' })).status).toBe('PENDING')
    expect(transformFulfillment('O1', makeItem({ order_item_status: 'PACKING' })).status).toBe('PENDING')
    expect(transformFulfillment('O1', makeItem({ order_item_status: 'PACKED' })).status).toBe('PENDING')
    expect(transformFulfillment('O1', makeItem({ order_item_status: 'CANCELLED' })).status).toBe('CANCELLED')
  })

  it('emits one canonical fulfillment per order item', () => {
    const list = transformFulfillments('O3', [
      makeItem({ order_item_id: 'A', order_item_status: 'APPROVED' }),
      makeItem({ order_item_id: 'B', order_item_status: 'DELIVERED' }),
    ])
    expect(list).toHaveLength(2)
    expect(list[0]!.id).toBe('O3:A')
    expect(list[0]!.status).toBe('PENDING')
    expect(list[1]!.id).toBe('O3:B')
    expect(list[1]!.status).toBe('SUCCESS')
  })

  it('matches shipments to order items by order_item_id', () => {
    const items = [
      makeItem({ order_item_id: 'A' }),
      makeItem({ order_item_id: 'B' }),
    ]
    const shipments = [
      makeShipment({ shipment_id: 'S1', order_item_id: 'B', tracking_id: 'TRK-B' }),
    ]
    const list = transformFulfillments('O4', items, shipments)
    expect(list[0]!.trackingNumber).toBeUndefined()
    expect(list[1]!.trackingNumber).toBe('TRK-B')
    expect(list[1]!.id).toBe('S1')
  })

  it('exposes metadata with SKU and listing id', () => {
    const f = transformFulfillment('O5', makeItem())
    expect((f.metadata as { skuId?: string }).skuId).toBe('SKU-POLO-BLU-M')
    expect((f.metadata as { listingId?: string }).listingId).toBe('LSTSHRT001')
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const f = transformFulfillment('O6', makeItem())
    expect(() => FulfillmentSchema.parse(f)).not.toThrow()
  })

  it('returns empty array for undefined items', () => {
    expect(transformFulfillments('O7', undefined)).toEqual([])
    expect(transformFulfillments('O7', [])).toEqual([])
  })
})
