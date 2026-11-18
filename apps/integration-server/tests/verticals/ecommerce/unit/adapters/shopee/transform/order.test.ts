import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  mapFinancialStatus,
  mapFulfillmentStatus,
  type RawShopeeOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopee/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawShopeeOrder> = {}): RawShopeeOrder {
  return {
    order_sn: 'SG240501ABCDE',
    order_status: 'SHIPPED',
    currency: 'SGD',
    total_amount: 99.8,
    actual_shipping_fee: 5.0,
    buyer_user_id: 88888,
    buyer_username: 'shopperSG',
    item_list: [
      {
        item_id: 100200300,
        item_name: 'Wireless Bluetooth Earbuds',
        item_sku: 'WBE-001',
        model_id: 50001,
        model_quantity_purchased: 2,
        model_original_price: 59.9,
        model_discounted_price: 49.9,
        order_item_id: 7001,
      },
    ],
    recipient_address: {
      name: 'John Doe',
      phone: '+6591234567',
      city: 'Singapore',
      state: 'Singapore',
      zipcode: '123456',
      country: 'SG',
      full_address: '123 Orchard Road, #04-56',
    },
    create_time: 1714560000, // 2024-05-01T12:00:00Z
    update_time: 1714646400,
    pay_time: 1714560300,
    note: 'Please pack carefully',
    ...overrides,
  }
}

describe('transformOrder (Shopee)', () => {
  it('uses order_sn as the canonical id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('SG240501ABCDE')
    expect(result.orderNumber).toBe('SG240501ABCDE')
    expect(result.name).toBe('SG240501ABCDE')
  })

  it('maps total amounts', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalPrice).toEqual({ amount: 9980, currency: 'SGD' })
    expect(result.totalShipping).toEqual({ amount: 500, currency: 'SGD' })
    expect(result.currency).toBe('SGD')
  })

  it('maps SHIPPED status to PAID + FULFILLED', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('hydrates line items with unit price', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('7001')
    expect(li.productId).toBe('100200300')
    expect(li.variantId).toBe('50001')
    expect(li.title).toBe('Wireless Bluetooth Earbuds')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 4990, currency: 'SGD' })
  })

  it('computes totalDiscount on line items', () => {
    const result = transformOrder(makeOrder())
    const li = result.lineItems![0]!
    // (59.9 - 49.9) * 2 = 20 major → 2000 minor
    expect(li.totalDiscount).toEqual({ amount: 2000, currency: 'SGD' })
  })

  it('maps shipping address', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress).toEqual({
      line1: '123 Orchard Road, #04-56',
      city: 'Singapore',
      region: 'Singapore',
      postalCode: '123456',
      country: 'SG',
    })
  })

  it('maps note from message_to_seller', () => {
    const result = transformOrder(makeOrder({ message_to_seller: 'Gift wrap please' }))
    expect(result.note).toBe('Gift wrap please')
  })

  it('converts timestamps to ISO strings', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toMatch(/2024-05/)
    expect(result.processedAt).toBeTruthy()
  })

  it('satisfies OrderSchema and preserves raw in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
    expect(result.metadata).toBe(raw)
  })

  it('maps CANCELLED status with cancel reason', () => {
    const result = transformOrder(
      makeOrder({
        order_status: 'CANCELLED',
        cancel_reason: 'Out of stock',
      }),
    )
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
    expect(result.cancelReason).toBe('Out of stock')
    expect(result.cancelledAt).toBeTruthy()
  })

  it('returns empty lineItems as undefined', () => {
    const result = transformOrder(makeOrder({ item_list: [] }))
    expect(result.lineItems).toBeUndefined()
  })
})

describe('mapFinancialStatus (Shopee)', () => {
  it('maps all known statuses', () => {
    expect(mapFinancialStatus('UNPAID')).toBe('PENDING')
    expect(mapFinancialStatus('INVOICE_PENDING')).toBe('PENDING')
    expect(mapFinancialStatus('READY_TO_SHIP')).toBe('PAID')
    expect(mapFinancialStatus('PROCESSED')).toBe('PAID')
    expect(mapFinancialStatus('SHIPPED')).toBe('PAID')
    expect(mapFinancialStatus('COMPLETED')).toBe('PAID')
    expect(mapFinancialStatus('IN_CANCEL')).toBe('PAID')
    expect(mapFinancialStatus('CANCELLED')).toBe('VOIDED')
  })

  it('returns undefined for unknown status', () => {
    expect(mapFinancialStatus('MYSTERY')).toBeUndefined()
    expect(mapFinancialStatus(undefined)).toBeUndefined()
  })
})

describe('mapFulfillmentStatus (Shopee)', () => {
  it('maps all known statuses', () => {
    expect(mapFulfillmentStatus('UNPAID')).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus('READY_TO_SHIP')).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus('PROCESSED')).toBe('PARTIAL')
    expect(mapFulfillmentStatus('SHIPPED')).toBe('FULFILLED')
    expect(mapFulfillmentStatus('COMPLETED')).toBe('FULFILLED')
    expect(mapFulfillmentStatus('CANCELLED')).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus('IN_CANCEL')).toBe('UNFULFILLED')
  })

  it('returns undefined for unknown status', () => {
    expect(mapFulfillmentStatus('MYSTERY')).toBeUndefined()
    expect(mapFulfillmentStatus(undefined)).toBeUndefined()
  })
})
