import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawShoplineOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopline/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawShoplineOrder> = {}): RawShoplineOrder {
  return {
    id: 1001,
    order_number: 1001,
    name: '#1001',
    customer: { id: 7001 },
    email: 'ada@example.com',
    phone: '+14155550123',
    currency: 'USD',
    subtotal_price: '100.00',
    total_tax: '8.25',
    total_discounts: '5.00',
    total_shipping_price_set: {
      shop_money: { amount: '4.99', currency_code: 'USD' },
    },
    total_price: '108.24',
    financial_status: 'paid',
    fulfillment_status: 'fulfilled',
    line_items: [
      {
        id: 9001,
        product_id: 501,
        variant_id: 901,
        title: 'Classic T-Shirt',
        quantity: 2,
        price: '49.99',
        total_discount: '0.00',
        sku: 'SHIRT-BLK-M',
        fulfillable_quantity: 0,
        fulfillment_status: 'fulfilled',
      },
    ],
    billing_address: {
      address1: '1 Market St',
      city: 'San Francisco',
      zip: '94105',
      country_code: 'US',
    },
    shipping_address: {
      address1: '1 Market St',
      city: 'San Francisco',
      zip: '94105',
      country_code: 'US',
    },
    fulfillments: [{ id: 8001 }],
    refunds: [{ id: 3001 }],
    transactions: [{ id: 6001 }],
    discount_codes: [{ code: 'SAVE5' }],
    tags: 'vip, returning',
    note: 'Please gift wrap',
    created_at: '2024-01-15T10:00:00.000Z',
    updated_at: '2024-01-15T12:00:00.000Z',
    processed_at: '2024-01-15T10:00:00.000Z',
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps core scalar fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('1001')
    expect(result.orderNumber).toBe('1001')
    expect(result.name).toBe('#1001')
    expect(result.email).toBe('ada@example.com')
    expect(result.currency).toBe('USD')
  })

  it('resolves customerId from customer.id', () => {
    const result = transformOrder(makeOrder())
    expect(result.customerId).toBe('7001')
  })

  it('falls back to buyer_id when customer is absent', () => {
    const result = transformOrder(makeOrder({ customer: null, buyer_id: 9999 }))
    expect(result.customerId).toBe('9999')
  })

  it('converts money fields to minor units', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalPrice).toEqual({ amount: 10824, currency: 'USD' })
    expect(result.subtotalPrice).toEqual({ amount: 10000, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 825, currency: 'USD' })
    expect(result.totalDiscounts).toEqual({ amount: 500, currency: 'USD' })
  })

  it('prefers total_shipping_price_set over flat field', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalShipping).toEqual({ amount: 499, currency: 'USD' })
  })

  it('falls back to total_shipping_price when set absent', () => {
    const result = transformOrder(
      makeOrder({ total_shipping_price_set: undefined, total_shipping_price: '3.50' }),
    )
    expect(result.totalShipping).toEqual({ amount: 350, currency: 'USD' })
  })

  it('maps financial and fulfillment statuses', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps nested line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('9001')
    expect(li.productId).toBe('501')
    expect(li.variantId).toBe('901')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 4999, currency: 'USD' })
    expect(li.sku).toBe('SHIRT-BLK-M')
    expect(li.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps id arrays', () => {
    const result = transformOrder(makeOrder())
    expect(result.fulfillmentIds).toEqual(['8001'])
    expect(result.refundIds).toEqual(['3001'])
    expect(result.transactionIds).toEqual(['6001'])
  })

  it('resolves discount codes from object array', () => {
    const result = transformOrder(makeOrder())
    expect(result.discountCodes).toEqual(['SAVE5'])
  })

  it('resolves discount codes from string array', () => {
    const result = transformOrder(makeOrder({ discount_codes: ['FLAT10'] }))
    expect(result.discountCodes).toEqual(['FLAT10'])
  })

  it('splits tag string', () => {
    const result = transformOrder(makeOrder())
    expect(result.tags).toEqual(['vip', 'returning'])
  })

  it('maps billing and shipping addresses', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress?.city).toBe('San Francisco')
    expect(result.billingAddress?.country).toBe('US')
    expect(result.shippingAddress?.postalCode).toBe('94105')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('satisfies OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformOrder', () => {
    const canonical = transformOrder(makeOrder())
    const body = untransformOrder(canonical)
    expect(body.email).toBe('ada@example.com')
    expect(body.currency).toBe('USD')
    expect(body.note).toBe('Please gift wrap')
    // line items re-serialised with price in major units
    const li = (body.line_items as Record<string, unknown>[])[0]!
    expect(li.quantity).toBe(2)
    expect(li.price).toBe('49.99')
  })
})
