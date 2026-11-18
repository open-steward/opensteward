import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawVolusionCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/volusion/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeCoupon(overrides: Partial<RawVolusionCoupon> = {}): RawVolusionCoupon {
  return {
    CouponID: 6001,
    CouponCode: 'SAVE10',
    CouponName: '10% Off Everything',
    DiscountType: 'Percentage',
    DiscountAmount: 10,
    MinimumOrder: 50,
    UsageLimit: 100,
    UsageCount: 25,
    StartDate: '2024-01-01T00:00:00Z',
    EndDate: '2024-12-31T23:59:59Z',
    DateCreated: '2024-01-01T00:00:00Z',
    IsActive: true,
    ...overrides,
  }
}

describe('transformDiscount', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.id).toBe('6001')
    expect(typeof result.id).toBe('string')
    expect(result.code).toBe('SAVE10')
    expect(result.title).toBe('10% Off Everything')
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
    expect(result.appliesTo).toBe('ORDER')
    expect(result.usageLimit).toBe(100)
    expect(result.usageCount).toBe(25)
  })

  it('maps the minimum order as minimum purchase amount', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.minimumPurchaseAmount).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('detects FIXED_AMOUNT discounts', () => {
    const result = transformDiscount(makeCoupon({ DiscountType: 'Fixed Amount', DiscountAmount: 15 }))
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(1500)
  })

  it('detects FREE_SHIPPING discounts', () => {
    const result = transformDiscount(makeCoupon({ DiscountType: 'Free Shipping' }))
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('handles negative discount amounts', () => {
    const result = transformDiscount(makeCoupon({ DiscountAmount: -20 }))
    expect(result.value).toBe(20)
  })

  it('handles zero minimum order', () => {
    const result = transformDiscount(makeCoupon({ MinimumOrder: 0 }))
    expect(result.minimumPurchaseAmount).toBeUndefined()
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

  it('round-trips writable fields via untransformDiscount', () => {
    const canonical = transformDiscount(makeCoupon())
    const raw = untransformDiscount(canonical)
    expect(raw.CouponCode).toBe('SAVE10')
    expect(raw.CouponName).toBe('10% Off Everything')
    expect(raw.DiscountType).toBe('Percentage')
    expect(raw.DiscountAmount).toBe(10)
  })
})
