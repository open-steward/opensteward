import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawWooCommerceCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/vnda/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeCoupon(overrides: Partial<RawWooCommerceCoupon> = {}): RawWooCommerceCoupon {
  return {
    id: 55,
    code: 'SAVE10',
    amount: '10',
    discount_type: 'percent',
    usage_count: 3,
    usage_limit: 100,
    minimum_amount: '50.00',
    date_expires_gmt: '2026-12-31T23:59:59.000Z',
    date_created_gmt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformDiscount (VNDA/WooCommerce)', () => {
  it('maps id, code and title', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.id).toBe('55')
    expect(result.code).toBe('SAVE10')
    expect(result.title).toBe('SAVE10')
  })

  it('maps discount_type=percent to PERCENTAGE', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
  })

  it('maps discount_type=fixed_cart to FIXED_AMOUNT and converts to minor units', () => {
    const result = transformDiscount(makeCoupon({ discount_type: 'fixed_cart', amount: '5.00' }))
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(500)
  })

  it('maps free_shipping=true to FREE_SHIPPING (overrides discount_type)', () => {
    const result = transformDiscount(makeCoupon({ free_shipping: true, discount_type: 'percent' }))
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps minimumPurchaseAmount from minimum_amount', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.minimumPurchaseAmount).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('maps usageLimit and usageCount', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.usageLimit).toBe(100)
    expect(result.usageCount).toBe(3)
  })

  it('maps endsAt and createdAt', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.endsAt).toBe('2026-12-31T23:59:59.000Z')
    expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('maps product_ids to productIds', () => {
    const result = transformDiscount(makeCoupon({ product_ids: [10, 20] }))
    expect(result.productIds).toEqual(['10', '20'])
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCoupon()
    const result = transformDiscount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying DiscountSchema', () => {
    const result = transformDiscount(makeCoupon())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('round-trips code and type via untransformDiscount', () => {
    const discount = transformDiscount(makeCoupon())
    const body = untransformDiscount(discount)
    expect(body['code']).toBe('SAVE10')
    expect(body['discount_type']).toBe('percent')
  })
})
