import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawWooCommerceCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/gambio/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeCoupon(overrides: Partial<RawWooCommerceCoupon> = {}): RawWooCommerceCoupon {
  return {
    id: 100,
    code: 'PERCENT10',
    amount: '10',
    discount_type: 'percent',
    usage_count: 5,
    usage_limit: 100,
    product_ids: [777, 888],
    product_categories: [10, 20],
    minimum_amount: '50.00',
    date_created_gmt: '2024-03-01T00:00:00Z',
    date_expires_gmt: '2024-06-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformDiscount (Gambio / WooCommerce)', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.id).toBe('100')
    expect(typeof result.id).toBe('string')
    // code and title both come from raw.code
    expect(result.code).toBe('PERCENT10')
    expect(result.title).toBe('PERCENT10')
    expect(result.usageCount).toBe(5)
    expect(result.usageLimit).toBe(100)
  })

  it('maps percent discount type and value as-is', () => {
    const result = transformDiscount(makeCoupon({ discount_type: 'percent', amount: '15' }))
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(15)
  })

  it('maps fixed_cart type to FIXED_AMOUNT and converts to minor units', () => {
    const result = transformDiscount(
      makeCoupon({ discount_type: 'fixed_cart', amount: '5.00', product_ids: [] }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(500)
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps free_shipping: true to FREE_SHIPPING regardless of discount_type', () => {
    const result = transformDiscount(makeCoupon({ free_shipping: true, discount_type: 'percent' }))
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps productIds and collectionIds', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.productIds).toEqual(['777', '888'])
    expect(result.collectionIds).toEqual(['10', '20'])
  })

  it('converts minimumPurchaseAmount from major to minor units', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.minimumPurchaseAmount).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('maps endsAt and createdAt from GMT fields', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.endsAt).toBe('2024-06-01T00:00:00Z')
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCoupon()
    const result = transformDiscount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    const result = transformDiscount(makeCoupon())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformDiscount', () => {
    const canonical = transformDiscount(makeCoupon({ discount_type: 'percent', product_ids: [] }))
    const back = untransformDiscount(canonical)
    expect(back.discount_type).toBe('percent')
    expect(back.code).toBe('PERCENT10')
  })
})
