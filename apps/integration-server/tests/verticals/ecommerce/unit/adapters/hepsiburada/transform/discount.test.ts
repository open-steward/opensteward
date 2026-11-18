import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawWooCommerceCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/hepsiburada/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeRaw(overrides: Partial<RawWooCommerceCoupon> = {}): RawWooCommerceCoupon {
  return {
    id: 55,
    code: 'INDIRIM10',
    amount: '10.00',
    discount_type: 'percent',
    description: '10% discount',
    date_created: '2024-03-01T00:00:00Z',
    date_created_gmt: '2024-03-01T00:00:00Z',
    date_expires: '2024-03-31T00:00:00Z',
    date_expires_gmt: '2024-03-31T00:00:00Z',
    usage_count: 3,
    individual_use: false,
    product_ids: [],
    excluded_product_ids: [],
    usage_limit: 200,
    free_shipping: false,
    product_categories: [],
    minimum_amount: '50.00',
    email_restrictions: [],
    used_by: [],
    ...overrides,
  }
}

describe('transformDiscount (hepsiburada / WooCommerce)', () => {
  it('maps id and code', () => {
    const result = transformDiscount(makeRaw())
    expect(result.id).toBe('55')
    expect(result.code).toBe('INDIRIM10')
  })

  it('maps percent type to PERCENTAGE', () => {
    const result = transformDiscount(makeRaw())
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
  })

  it('maps fixed_cart type to FIXED_AMOUNT and converts to minor units', () => {
    const result = transformDiscount(makeRaw({ discount_type: 'fixed_cart', amount: '15.00' }))
    expect(result.type).toBe('FIXED_AMOUNT')
    // 15.00 USD → 1500 cents
    expect(result.value).toBe(1500)
  })

  it('maps free_shipping to FREE_SHIPPING type', () => {
    const result = transformDiscount(makeRaw({ free_shipping: true }))
    expect(result.type).toBe('FREE_SHIPPING')
  })

  it('maps minimumPurchaseAmount from minimum_amount', () => {
    const result = transformDiscount(makeRaw())
    // 50.00 → 5000 minor units
    expect(result.minimumPurchaseAmount).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('maps usageLimit and usageCount', () => {
    const result = transformDiscount(makeRaw())
    expect(result.usageLimit).toBe(200)
    expect(result.usageCount).toBe(3)
  })

  it('maps endsAt from date_expires_gmt', () => {
    const result = transformDiscount(makeRaw())
    expect(result.endsAt).toBe('2024-03-31T00:00:00Z')
  })

  it('maps createdAt from date_created_gmt', () => {
    const result = transformDiscount(makeRaw())
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
  })

  it('maps appliesTo ORDER for percent with no specific product_ids', () => {
    const result = transformDiscount(makeRaw({ discount_type: 'percent', product_ids: [] }))
    expect(result.appliesTo).toBe('ORDER')
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    expect(() => DiscountSchema.parse(transformDiscount(makeRaw()))).not.toThrow()
  })

  it('round-trips via untransformDiscount', () => {
    const canonical = transformDiscount(makeRaw())
    const body = untransformDiscount(canonical)
    expect(body['code']).toBe('INDIRIM10')
    expect(body['discount_type']).toBe('percent')
  })
})
