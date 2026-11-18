/**
 * SendOwl Order → canonical Order.
 *
 * Field shapes verified against
 * https://dashboard.sendowl.com/developers/api/orders (2026-09-13) — the
 * full example response for `GET /api/v1_3/orders/#{id}` quoted there:
 * `cart.cart_items[].cart_item`, `refund_transactions[].refund_transaction`,
 * `settled_gross`/`settled_tax`/`settled_shipping` (decimal strings),
 * `refunded` boolean, `access_allowed` boolean, `billing_*`/`shipping_*`
 * address fields, `buyer_email`, `buyer_name`, `customer_id`, `state`,
 * `tag`, `discount`, `created_at`, `updated_at`.
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type RawSendOwlOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/sendowl/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawSendOwlOrder> = {}): RawSendOwlOrder {
  return {
    id: 3101,
    state: 'complete',
    buyer_name: 'Test User',
    buyer_email: 'testuser@gmail.com',
    customer_id: 8842,
    settled_currency: 'GBP',
    settled_gross: '64.90',
    settled_tax: '5.90',
    settled_shipping: null,
    discount: null,
    tag: null,
    refunded: false,
    refund_transactions: [],
    access_allowed: true,
    shipping_address1: null,
    shipping_city: null,
    shipping_country: 'US',
    billing_address1: null,
    billing_city: null,
    billing_country: 'US',
    cart: {
      cart_items: [
        { cart_item: { quantity: 2, product_id: 1, price_at_checkout: 19 } },
        { cart_item: { quantity: 1, package_id: 3, price_at_checkout: 19 } },
      ],
      discount_code: 'mycode',
      discount_code_used: true,
    },
    created_at: '2011-05-17T06:05:56Z',
    updated_at: '2011-05-17T06:15:13Z',
    ...overrides,
  }
}

describe('transformOrder (sendowl)', () => {
  it('maps core fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('3101')
    expect(result.email).toBe('testuser@gmail.com')
    expect(result.customerId).toBe('8842')
    expect(result.currency).toBe('GBP')
  })

  it('maps a complete, unrefunded order to PAID / FULFILLED', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps a fully refunded order to REFUNDED', () => {
    const raw = makeOrder({
      refunded: true,
      refund_transactions: [
        { refund_transaction: { amount: '-64.90', currency: 'GBP', occurred_at: '2011-05-20T09:30:00Z' } },
      ],
    })
    const result = transformOrder(raw)
    expect(result.financialStatus).toBe('REFUNDED')
  })

  it('maps a partially refunded order to PARTIALLY_REFUNDED', () => {
    const raw = makeOrder({
      refunded: true,
      refund_transactions: [
        { refund_transaction: { amount: '-3.00', currency: 'GBP', occurred_at: '2011-05-20T09:30:00Z' } },
      ],
    })
    const result = transformOrder(raw)
    expect(result.financialStatus).toBe('PARTIALLY_REFUNDED')
  })

  it('maps access_allowed=false to UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ access_allowed: false }))
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('never maps cart.cart_items onto lineItems — no honest title field exists upstream', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toBeUndefined()
    // The raw cart is still reachable via metadata.
    expect(result.metadata['cart']).toEqual(makeOrder().cart)
  })

  it('leaves every money field unset when settled_currency is not reported', () => {
    const result = transformOrder(makeOrder({ settled_currency: undefined }))
    expect(result.currency).toBeUndefined()
    expect(result.totalPrice).toBeUndefined()
    expect(result.totalTax).toBeUndefined()
    expect(result.totalShipping).toBeUndefined()
    expect(result.totalDiscounts).toBeUndefined()
  })

  it('maps the discount code from the cart onto discountCodes', () => {
    const result = transformOrder(makeOrder())
    expect(result.discountCodes).toEqual(['mycode'])
  })

  it('maps billing and shipping addresses', () => {
    const raw = makeOrder({
      shipping_address1: '1 Infinite Loop',
      shipping_city: 'Cupertino',
      billing_address1: '1 Infinite Loop',
      billing_city: 'Cupertino',
    })
    const result = transformOrder(raw)
    expect(result.shippingAddress?.line1).toBe('1 Infinite Loop')
    expect(result.shippingAddress?.country).toBe('US')
    expect(result.billingAddress?.city).toBe('Cupertino')
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toEqual(raw)
  })

  it('produces a payload that satisfies OrderSchema', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOrder()))).not.toThrow()
  })

  it('satisfies OrderSchema for a minimal, un-refunded, empty-cart order', () => {
    const raw: RawSendOwlOrder = { id: 1, state: 'complete' }
    expect(() => OrderSchema.parse(transformOrder(raw))).not.toThrow()
  })

  it('exposes synthesized composite refund ids on refundIds — see transform/refund.ts', () => {
    const raw = makeOrder({
      refunded: true,
      refund_transactions: [
        { refund_transaction: { amount: '-3.00', currency: 'GBP', occurred_at: '2011-05-20T09:30:00Z' } },
        { refund_transaction: { amount: '-1.00', currency: 'GBP', occurred_at: '2011-05-21T09:30:00Z' } },
      ],
    })
    const result = transformOrder(raw)
    expect(result.refundIds).toEqual(['3101:0', '3101:1'])
  })
})
