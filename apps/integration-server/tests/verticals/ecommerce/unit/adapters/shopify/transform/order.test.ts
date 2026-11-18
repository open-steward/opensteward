import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawShopifyOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopify/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawShopifyOrder> = {}): RawShopifyOrder {
  return {
    id: 1001,
    order_number: 1001,
    name: '#1001',
    customer: { id: 7001 },
    email: 'ada@example.com',
    phone: '+1 555 000 1111',
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
        product_id: 987654321,
        variant_id: 111,
        title: 'Ocean Blue T-Shirt',
        quantity: 2,
        price: '49.99',
        sku: 'TEE-S-BLUE',
        fulfillable_quantity: 0,
        fulfillment_status: 'fulfilled',
      },
    ],
    billing_address: {
      address1: '1 Programming Ln',
      city: 'London',
      zip: 'NW1 2AB',
      country_code: 'GB',
      country: 'United Kingdom',
    },
    shipping_address: {
      address1: '1 Programming Ln',
      city: 'London',
      zip: 'NW1 2AB',
      country_code: 'GB',
      country: 'United Kingdom',
    },
    fulfillments: [{ id: 8001, order_id: 1001 }],
    refunds: [],
    transactions: [{ id: 6001 }],
    discount_codes: [{ code: 'SAVE5' }],
    tags: 'vip, returning',
    note: 'Gift wrap please',
    created_at: '2024-05-01T10:00:00Z',
    updated_at: '2024-05-01T12:00:00Z',
    processed_at: '2024-05-01T10:00:00Z',
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps core fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('1001')
    expect(typeof result.id).toBe('string')
    expect(result.orderNumber).toBe('1001')
    expect(result.name).toBe('#1001')
    expect(result.customerId).toBe('7001')
    expect(result.email).toBe('ada@example.com')
    expect(result.currency).toBe('USD')
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
    expect(result.totalPrice).toEqual({ amount: 10824, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 499, currency: 'USD' })
  })

  it('maps nested line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('9001')
    expect(li.productId).toBe('987654321')
    expect(li.variantId).toBe('111')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 4999, currency: 'USD' })
    expect(li.sku).toBe('TEE-S-BLUE')
    expect(li.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps id arrays and addresses', () => {
    const result = transformOrder(makeOrder())
    expect(result.fulfillmentIds).toEqual(['8001'])
    expect(result.transactionIds).toEqual(['6001'])
    expect(result.discountCodes).toEqual(['SAVE5'])
    expect(result.billingAddress?.country).toBe('GB')
    expect(result.shippingAddress?.postalCode).toBe('NW1 2AB')
    expect(result.tags).toEqual(['vip', 'returning'])
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformOrder', () => {
    const canonical = transformOrder(makeOrder())
    const raw = untransformOrder(canonical)
    expect(raw.email).toBe('ada@example.com')
    expect(raw.currency).toBe('USD')
    expect(raw.note).toBe('Gift wrap please')
  })
})
