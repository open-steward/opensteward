import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawWooCommerceOrder,
  type RawWooCommerceLineItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/vnda/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeLineItem(overrides: Partial<RawWooCommerceLineItem> = {}): RawWooCommerceLineItem {
  return {
    id: 201,
    name: 'Blue T-Shirt',
    product_id: 50,
    variation_id: 100,
    quantity: 2,
    total: '59.98',
    sku: 'TSHIRT-BLU',
    ...overrides,
  }
}

function makeOrder(overrides: Partial<RawWooCommerceOrder> = {}): RawWooCommerceOrder {
  return {
    id: 1042,
    number: '1042',
    status: 'processing',
    currency: 'USD',
    customer_id: 77,
    billing: {
      first_name: 'Jane',
      last_name: 'Doe',
      address_1: '123 Main St',
      address_2: 'Apt 4',
      city: 'New York',
      state: 'NY',
      postcode: '10001',
      country: 'US',
      email: 'jane@example.com',
      phone: '+14155550123',
    },
    shipping: {
      address_1: '456 Ship Rd',
      city: 'Brooklyn',
      postcode: '11201',
      country: 'US',
    },
    total: '59.98',
    subtotal: '59.98',
    discount_total: '0.00',
    shipping_total: '0.00',
    line_items: [makeLineItem()],
    coupon_lines: [{ id: 1, code: 'SAVE10' }],
    customer_note: 'Leave at door',
    date_created_gmt: '2026-01-15T09:30:00.000Z',
    date_modified_gmt: '2026-02-01T14:20:00.000Z',
    date_paid: '2026-01-15T10:00:00',
    ...overrides,
  }
}

describe('transformOrder (VNDA/WooCommerce)', () => {
  it('maps id, orderNumber, email and currency', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('1042')
    expect(result.orderNumber).toBe('1042')
    expect(result.email).toBe('jane@example.com')
    expect(result.currency).toBe('USD')
  })

  it('maps status=processing to PAID+UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'processing' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps status=completed to PAID+FULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'completed' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps status=cancelled to VOIDED+UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'cancelled' }))
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps status=refunded to REFUNDED+UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'refunded' }))
    expect(result.financialStatus).toBe('REFUNDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('converts total price from major-unit string to minor units', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalPrice).toEqual({ amount: 5998, currency: 'USD' })
  })

  it('maps customerId, phone from billing', () => {
    const result = transformOrder(makeOrder())
    expect(result.customerId).toBe('77')
    expect(result.phone).toBe('+14155550123')
  })

  it('maps billing and shipping addresses', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress!.line1).toBe('123 Main St')
    expect(result.billingAddress!.city).toBe('New York')
    expect(result.shippingAddress!.line1).toBe('456 Ship Rd')
  })

  it('maps line items with unit price', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('201')
    expect(li.title).toBe('Blue T-Shirt')
    expect(li.quantity).toBe(2)
    expect(li.sku).toBe('TSHIRT-BLU')
  })

  it('maps coupon codes', () => {
    const result = transformOrder(makeOrder())
    expect(result.discountCodes).toEqual(['SAVE10'])
  })

  it('maps processedAt from date_paid via toIsoDatetime', () => {
    const result = transformOrder(makeOrder())
    // toIsoDatetime normalises to .000Z suffix
    expect(result.processedAt).toMatch(/\.000Z$/)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('round-trips core fields via untransformOrder', () => {
    const order = transformOrder(makeOrder())
    const body = untransformOrder(order)
    expect(body['currency']).toBe('USD')
    expect(body['customer_note']).toBe('Leave at door')
  })
})
