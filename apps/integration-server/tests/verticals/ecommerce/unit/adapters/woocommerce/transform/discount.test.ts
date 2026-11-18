import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawWooCommerceCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/woocommerce/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeCoupon(
  overrides: Partial<RawWooCommerceCoupon> = {},
): RawWooCommerceCoupon {
  return {
    id: 3001,
    code: 'SAVE10',
    amount: '10.00',
    discount_type: 'percent',
    description: '10% Off Everything',
    date_created: '2024-01-01T00:00:00.000Z',
    date_created_gmt: '2024-01-01T00:00:00.000Z',
    date_expires: '2024-12-31T23:59:59.000Z',
    date_expires_gmt: '2024-12-31T23:59:59.000Z',
    usage_count: 25,
    individual_use: false,
    product_ids: [],
    excluded_product_ids: [],
    usage_limit: 100,
    usage_limit_per_user: null,
    free_shipping: false,
    product_categories: [],
    excluded_product_categories: [],
    minimum_amount: '50.00',
    maximum_amount: '0.00',
    ...overrides,
  }
}

describe('transformDiscount (WooCommerce)', () => {
  it('maps percent-type coupons correctly', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.id).toBe('3001')
    expect(typeof result.id).toBe('string')
    expect(result.code).toBe('SAVE10')
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
    expect(result.usageLimit).toBe(100)
    expect(result.usageCount).toBe(25)
    expect(result.appliesTo).toBe('ORDER')
    expect(result.endsAt).toBe('2024-12-31T23:59:59.000Z')
  })

  it('maps minimum purchase amount from minimum_amount', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.minimumPurchaseAmount).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('maps fixed_cart → FIXED_AMOUNT applied to ORDER', () => {
    const result = transformDiscount(
      makeCoupon({ discount_type: 'fixed_cart', amount: '15.00' }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(1500)
    expect(result.appliesTo).toBe('ORDER')
  })

  it('detects FREE_SHIPPING when free_shipping flag is true', () => {
    const result = transformDiscount(
      makeCoupon({ discount_type: 'percent', free_shipping: true }),
    )
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeCoupon()
    const result = transformDiscount(raw)
    expect(result.metadata).toBe(raw)
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformDiscount', () => {
    const canonical = transformDiscount(makeCoupon())
    const body = untransformDiscount(canonical)
    expect(body['code']).toBe('SAVE10')
    expect(body['discount_type']).toBe('percent')
    expect(body['amount']).toBe('10')
    expect(body['usage_limit']).toBe(100)
  })
})
