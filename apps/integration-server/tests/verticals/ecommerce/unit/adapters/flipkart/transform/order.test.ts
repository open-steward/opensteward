import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  mapFinancialStatus,
  mapFulfillmentStatus,
  type RawFlipkartOrder,
  type RawFlipkartOrderItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/flipkart/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrderItem(overrides: Partial<RawFlipkartOrderItem> = {}): RawFlipkartOrderItem {
  return {
    order_item_id: 'OI-FK-001',
    order_id: 'OD-FK-1234567890',
    listing_id: 'LSTSHRT001',
    sku_id: 'SKU-POLO-BLU-M',
    fsn: 'TSHFKN001',
    title: 'Blue Polo T-Shirt - Medium',
    quantity: 2,
    selling_price: { amount: 699, currency_code: 'INR' },
    shipping_charges: { amount: 0, currency_code: 'INR' },
    shipping_address: {
      name: 'A. Buyer',
      address_line1: '42 MG Road',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560001',
      country: 'IN',
    },
    order_item_status: 'DELIVERED',
    created_at: '2024-06-01T10:00:00Z',
    updated_at: '2024-06-03T14:00:00Z',
    ...overrides,
  }
}

function makeOrder(overrides: Partial<RawFlipkartOrder> = {}): RawFlipkartOrder {
  return {
    order_id: 'OD-FK-1234567890',
    order_items: [makeOrderItem()],
    order_date: '2024-06-01T10:00:00Z',
    updated_at: '2024-06-03T14:00:00Z',
    ...overrides,
  }
}

describe('transformOrder (Flipkart)', () => {
  it('maps core fields and uses order_id as the canonical id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('OD-FK-1234567890')
    expect(result.orderNumber).toBe('OD-FK-1234567890')
    expect(result.currency).toBe('INR')
    expect(result.totalPrice).toEqual({ amount: 1398, currency: 'INR' })
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
    expect(result.createdAt).toBe('2024-06-01T10:00:00Z')
  })

  it('hydrates line items with price and SKU', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('OI-FK-001')
    expect(li.sku).toBe('SKU-POLO-BLU-M')
    expect(li.title).toBe('Blue Polo T-Shirt - Medium')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 699, currency: 'INR' })
  })

  it('maps shipping address from the first order item', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress).toEqual({
      line1: '42 MG Road',
      line2: undefined,
      city: 'Bangalore',
      region: 'Karnataka',
      postalCode: '560001',
      country: 'IN',
    })
  })

  it('maps fulfillment status based on item statuses', () => {
    const allDelivered = [makeOrderItem({ order_item_status: 'DELIVERED' })]
    expect(mapFulfillmentStatus(allDelivered)).toBe('FULFILLED')

    const allCancelled = [makeOrderItem({ order_item_status: 'CANCELLED' })]
    expect(mapFulfillmentStatus(allCancelled)).toBe('UNFULFILLED')

    const mixed = [
      makeOrderItem({ order_item_status: 'DELIVERED' }),
      makeOrderItem({ order_item_status: 'APPROVED' }),
    ]
    expect(mapFulfillmentStatus(mixed)).toBe('PARTIAL')

    const allPending = [makeOrderItem({ order_item_status: 'APPROVED' })]
    expect(mapFulfillmentStatus(allPending)).toBe('UNFULFILLED')
  })

  it('maps financial status based on item statuses', () => {
    const allDelivered = [makeOrderItem({ order_item_status: 'DELIVERED' })]
    expect(mapFinancialStatus(allDelivered)).toBe('PAID')

    const allCancelled = [makeOrderItem({ order_item_status: 'CANCELLED' })]
    expect(mapFinancialStatus(allCancelled)).toBe('VOIDED')

    const mixed = [
      makeOrderItem({ order_item_status: 'SHIPPED' }),
      makeOrderItem({ order_item_status: 'APPROVED' }),
    ]
    expect(mapFinancialStatus(mixed)).toBe('PARTIALLY_PAID')

    const allPending = [makeOrderItem({ order_item_status: 'APPROVED' })]
    expect(mapFinancialStatus(allPending)).toBe('PENDING')
  })

  it('sets cancelledAt when all items are cancelled', () => {
    const order = makeOrder({
      order_items: [
        makeOrderItem({ order_item_status: 'CANCELLED' }),
      ],
    })
    const result = transformOrder(order)
    expect(result.cancelledAt).toBe('2024-06-03T14:00:00Z')
  })

  it('does not set cancelledAt when items are not all cancelled', () => {
    const result = transformOrder(makeOrder())
    expect(result.cancelledAt).toBeUndefined()
  })

  it('produces a payload that satisfies OrderSchema and preserves raw in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
    expect(result.metadata).toBe(raw)
  })

  it('does NOT expose buyer email or phone at the canonical level', () => {
    const result = transformOrder(makeOrder())
    expect(result.customerId).toBeUndefined()
    expect(result.email).toBeUndefined()
    expect(result.phone).toBeUndefined()
    expect(result.billingAddress).toBeUndefined()
  })
})
