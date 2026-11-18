import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawRechargeOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/recharge/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawRechargeOrder> = {}): RawRechargeOrder {
  return {
    id: 5001,
    customer_id: 9001,
    currency: 'USD',
    total_price: '49.97',
    subtotal_price: '40.00',
    total_tax: '4.00',
    total_discounts: '5.00',
    financial_status: 'success',
    fulfillment_status: 'fulfilled',
    line_items: [
      {
        purchase_item_id: 801,
        external_product_id: { ecommerce: 'prod-1' },
        external_variant_id: { ecommerce: 'var-1' },
        title: 'Coffee Beans',
        quantity: 2,
        unit_price: '20.00',
        sku: 'COFFEE-250G',
      },
    ],
    billing_address: {
      address1: '10 Baker St',
      city: 'London',
      zip: 'NW1 6XE',
      country_code: 'GB',
    },
    shipping_address: {
      address1: '10 Baker St',
      city: 'London',
      zip: 'NW1 6XE',
      country_code: 'GB',
    },
    discount_codes: [{ code: 'SAVE5', amount: '5.00' }],
    tags: 'subscription, vip',
    note: 'Please gift wrap',
    created_at: '2024-05-01T10:00:00Z',
    updated_at: '2024-05-02T08:00:00Z',
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('5001')
    expect(typeof result.id).toBe('string')
    expect(result.customerId).toBe('9001')
    expect(result.currency).toBe('USD')
    expect(result.note).toBe('Please gift wrap')
  })

  it('converts money fields to minor units', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalPrice).toEqual({ amount: 4997, currency: 'USD' })
    expect(result.subtotalPrice).toEqual({ amount: 4000, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 400, currency: 'USD' })
    expect(result.totalDiscounts).toEqual({ amount: 500, currency: 'USD' })
  })

  it('maps financial status: success → PAID', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps financial status from charge status field when financial_status absent', () => {
    const result = transformOrder(makeOrder({ financial_status: null, status: 'pending' }))
    expect(result.financialStatus).toBe('PENDING')
  })

  it('maps fulfillment status: fulfilled → FULFILLED', () => {
    const result = transformOrder(makeOrder())
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps line items with minor-unit prices', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('801')
    expect(li.productId).toBe('prod-1')
    expect(li.variantId).toBe('var-1')
    expect(li.title).toBe('Coffee Beans')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 2000, currency: 'USD' })
  })

  it('maps billing and shipping addresses', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress?.line1).toBe('10 Baker St')
    expect(result.billingAddress?.country).toBe('GB')
    expect(result.shippingAddress?.city).toBe('London')
  })

  it('parses tags string into array', () => {
    const result = transformOrder(makeOrder())
    expect(result.tags).toEqual(['subscription', 'vip'])
  })

  it('maps discount codes', () => {
    const result = transformOrder(makeOrder())
    expect(result.discountCodes).toEqual(['SAVE5'])
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

  it('round-trips note and tags via untransformOrder', () => {
    const canonical = transformOrder(makeOrder())
    const raw = untransformOrder(canonical)
    expect(raw.note).toBe('Please gift wrap')
    expect(raw.tags).toBe('subscription, vip')
  })
})
