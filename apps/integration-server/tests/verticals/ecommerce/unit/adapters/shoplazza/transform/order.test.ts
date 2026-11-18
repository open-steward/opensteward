import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawShoplazzaOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/shoplazza/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeRaw(overrides: Partial<RawShoplazzaOrder> = {}): RawShoplazzaOrder {
  return {
    id: 70001,
    number: 1088,
    name: '#1088',
    customer: { id: 40001, email: 'buyer@example.com' },
    email: 'buyer@example.com',
    currency: 'USD',
    // Shoplazza uses sub_total (not subtotal_price)
    sub_total: '79.98',
    total_tax: '7.20',
    total_discount: '5.00',
    total_shipping: '8.99',
    total_price: '91.17',
    financial_status: 'paid',
    fulfillment_status: 'fulfilled',
    line_items: [
      {
        id: 701,
        product_id: 60001,
        variant_id: 70001,
        // Shoplazza title resolution: name > title > product_title > variant_title
        name: 'Blue T-Shirt / S',
        quantity: 2,
        price: '39.99',
        total_discount: '2.50',
        sku: 'BTS-S',
      },
    ],
    billing_address: {
      address1: '1 Buyer Road',
      city: 'San Jose',
      zip: '95101',
      country_code: 'US',
    },
    shipping_address: {
      address1: '2 Ship Ave',
      city: 'San Jose',
      zip: '95102',
      country_code: 'US',
    },
    // Shoplazza supports both discount_code and discount_codes
    discount_code: 'SUMMER15',
    tags: 'first-order,mobile',
    placed_at: '2024-04-15T09:00:00.000Z',
    created_at: '2024-04-15T09:00:00.000Z',
    updated_at: '2024-04-16T08:00:00.000Z',
    ...overrides,
  }
}

describe('shoplazza transformOrder', () => {
  it('maps id to string', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('70001')
  })

  it('maps number to orderNumber', () => {
    const result = transformOrder(makeRaw())
    expect(result.orderNumber).toBe('1088')
  })

  it('maps financial_status paid to PAID', () => {
    const result = transformOrder(makeRaw())
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps fulfillment_status fulfilled to FULFILLED', () => {
    const result = transformOrder(makeRaw())
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('converts total_price to minor units (USD: ×100)', () => {
    const result = transformOrder(makeRaw())
    // 91.17 USD = 9117 cents
    expect(result.totalPrice?.amount).toBe(9117)
    expect(result.totalPrice?.currency).toBe('USD')
  })

  it('maps sub_total (Shoplazza field, not subtotal_price)', () => {
    const result = transformOrder(makeRaw())
    // 79.98 USD = 7998 cents
    expect(result.subtotalPrice?.amount).toBe(7998)
  })

  it('maps total_discount (Shoplazza field, not total_discounts)', () => {
    const result = transformOrder(makeRaw())
    // 5.00 USD = 500 cents
    expect(result.totalDiscounts?.amount).toBe(500)
  })

  it('resolves line item title via name field (Shoplazza priority)', () => {
    const result = transformOrder(makeRaw())
    expect(result.lineItems![0].title).toBe('Blue T-Shirt / S')
    // 39.99 USD = 3999 cents
    expect(result.lineItems![0].price.amount).toBe(3999)
  })

  it('maps billing and shipping addresses', () => {
    const result = transformOrder(makeRaw())
    expect(result.billingAddress?.city).toBe('San Jose')
    expect(result.shippingAddress?.line1).toBe('2 Ship Ave')
  })

  it('collects discount_code as discountCodes', () => {
    const result = transformOrder(makeRaw())
    expect(result.discountCodes).toContain('SUMMER15')
  })

  it('deduplicates discount codes between discount_code and discount_codes', () => {
    const result = transformOrder(
      makeRaw({
        discount_code: 'CODE1',
        discount_codes: [
          { code: 'CODE1', amount: '5' },
          { code: 'CODE2', amount: '3' },
        ],
      }),
    )
    expect(result.discountCodes).toEqual(['CODE1', 'CODE2'])
  })

  it('maps placed_at to processedAt', () => {
    const result = transformOrder(makeRaw())
    expect(result.processedAt).toBe('2024-04-15T09:00:00.000Z')
  })

  it('produces output that passes OrderSchema', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformOrder (tags joined without space)', () => {
    const canonical = transformOrder(makeRaw())
    const back = untransformOrder(canonical)
    expect(back.email).toBe('buyer@example.com')
    expect(back.currency).toBe('USD')
    // Shoplazza joins tags with ',' (no space)
    expect(back.tags).toBe('first-order,mobile')
  })
})
