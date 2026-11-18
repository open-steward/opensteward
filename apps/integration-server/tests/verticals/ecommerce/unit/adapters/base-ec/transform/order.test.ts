/**
 * BASE order ↔ canonical Order.
 * Docs: https://docs.thebase.in/api/orders , https://docs.thebase.in/api/orders/detail ,
 * https://docs.thebase.in/api/orders/edit_status
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type RawBaseEcOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/base-ec/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawBaseEcOrder> = {}): RawBaseEcOrder {
  return {
    unique_key: 'abc123',
    ordered: 1750000000,
    modified: 1750000100,
    dispatch_status: 'ordered',
    payment: 'creditcard',
    mail_address: 'jane@example.com',
    first_name: 'Jane',
    last_name: 'Doe',
    zip_code: '150-0001',
    prefecture: 'Tokyo',
    address: '1-1-1 Jinnan',
    country_code: 'JP',
    total: 3900,
    shipping_fee: 500,
    order_items: [
      { order_item_id: 1, item_id: 1234, title: 'Tシャツ', price: 3900, amount: 1, status: 'ordered' },
    ],
    ...overrides,
  }
}

describe('transformOrder (BASE)', () => {
  it('maps core order fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('abc123')
    expect(result.orderNumber).toBe('abc123')
    expect(result.email).toBe('jane@example.com')
    expect(result.currency).toBe('JPY')
    expect(result.totalPrice).toEqual({ amount: 3900, currency: 'JPY' })
    expect(result.totalShipping).toEqual({ amount: 500, currency: 'JPY' })
  })

  it('maps dispatch_status to financial/fulfillment status', () => {
    expect(transformOrder(makeOrder({ dispatch_status: 'unpaid' })).financialStatus).toBe('PENDING')
    expect(transformOrder(makeOrder({ dispatch_status: 'cancelled' })).financialStatus).toBe('VOIDED')
    expect(transformOrder(makeOrder({ dispatch_status: 'ordered' })).financialStatus).toBe('PAID')
    expect(transformOrder(makeOrder({ dispatch_status: 'dispatched' })).fulfillmentStatus).toBe('FULFILLED')
    expect(transformOrder(makeOrder({ dispatch_status: 'ordered' })).fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps order_items to lineItems with a variantId when variation_id is present', () => {
    const result = transformOrder(
      makeOrder({
        order_items: [
          { order_item_id: 1, item_id: 1234, variation_id: 11, title: 'Tシャツ (黒)', price: 3900, amount: 2, status: 'dispatched' },
        ],
      }),
    )
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('1')
    expect(li.productId).toBe('1234')
    expect(li.variantId).toBe('1234:11')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 3900, currency: 'JPY' })
    expect(li.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps shipping address fields onto AddressSchema field names', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress).toEqual({
      line1: '1-1-1 Jinnan',
      line2: undefined,
      postalCode: '150-0001',
      region: 'Tokyo',
      country: 'JP',
    })
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces a payload that satisfies OrderSchema', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOrder()))).not.toThrow()
  })

  it('throws, naming the order and line item, when a line item has no title', () => {
    const order = makeOrder({
      order_items: [{ order_item_id: 9, item_id: 1234, price: 100, amount: 1, status: 'ordered' }],
    })
    expect(() => transformOrder(order)).toThrow(/order 'abc123' line item '9' has no title/)
  })

  it('throws when a line item has no amount (quantity), rather than inventing 0', () => {
    const order = makeOrder({
      order_items: [{ order_item_id: 9, item_id: 1234, title: 'X', price: 100, status: 'ordered' }],
    })
    expect(() => transformOrder(order)).toThrow(/order 'abc123' line item '9' has no amount/)
  })

  it('throws when a line item has no price, rather than inventing 0', () => {
    const order = makeOrder({
      order_items: [{ order_item_id: 9, item_id: 1234, title: 'X', amount: 1, status: 'ordered' }],
    })
    expect(() => transformOrder(order)).toThrow(/order 'abc123' line item '9' has no price/)
  })
})
