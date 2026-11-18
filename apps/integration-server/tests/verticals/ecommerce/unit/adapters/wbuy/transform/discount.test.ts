import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawWooCommerceCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/wbuy/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeCoupon(
  overrides: Partial<RawWooCommerceCoupon> = {},
): RawWooCommerceCoupon {
  return {
    id: 5,
    code: 'SAVE10',
    amount: '10',
    discount_type: 'percent',
    description: '10% Off',
    usage_count: 0,
    free_shipping: false,
    product_ids: [],
    product_categories: [],
    ...overrides,
  }
}

describe('transformDiscount (wbuy)', () => {
  it('maps percent-type coupons correctly', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.id).toBe('5')
    expect(typeof result.id).toBe('string')
    expect(result.code).toBe('SAVE10')
    expect(result.type).toBe('PERCENTAGE')
    // Percentage value stays as raw number
    expect(result.value).toBe(10)
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps fixed_cart coupon → FIXED_AMOUNT in minor units', () => {
    const result = transformDiscount(
      makeCoupon({ discount_type: 'fixed_cart', amount: '15.00' }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(1500)
    expect(result.appliesTo).toBe('ORDER')
  })

  it('detects FREE_SHIPPING when free_shipping flag is true', () => {
    const result = transformDiscount(
      makeCoupon({ free_shipping: true }),
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
  })
})
