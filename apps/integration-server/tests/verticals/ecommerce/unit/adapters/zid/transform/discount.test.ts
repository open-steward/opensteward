import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawZidCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/zid/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeCoupon(overrides: Partial<RawZidCoupon> = {}): RawZidCoupon {
  return {
    id: 501,
    code: 'SUMMER10',
    title: 'Summer 10% Off',
    discount_type: 'percentage',
    discount_value: 10,
    minimum_order_amount: 100,
    usage_limit: 50,
    used_count: 3,
    expires_at: '2026-08-31T23:59:59Z',
    starts_at: '2026-06-01T00:00:00Z',
    is_active: true,
    created_at: '2026-05-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformDiscount (Zid)', () => {
  it('maps numeric id to string', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.id).toBe('501')
  })

  it('maps code', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.code).toBe('SUMMER10')
  })

  it('maps title', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.title).toBe('Summer 10% Off')
  })

  it('maps percentage type', () => {
    const result = transformDiscount(makeCoupon({ discount_type: 'percentage' }))
    expect(result.type).toBe('PERCENTAGE')
  })

  it('maps fixed type', () => {
    const result = transformDiscount(makeCoupon({ discount_type: 'fixed' }))
    expect(result.type).toBe('FIXED_AMOUNT')
  })

  it('maps free_shipping type', () => {
    const result = transformDiscount(makeCoupon({ discount_type: 'free_shipping' }))
    expect(result.type).toBe('FREE_SHIPPING')
  })

  it('keeps value as-is for percentage type', () => {
    const result = transformDiscount(
      makeCoupon({ discount_type: 'percentage', discount_value: 10 }),
    )
    // percentage value is not converted to minor units
    expect(result.value).toBe(10)
  })

  it('converts fixed amount value to minor units (SAR × 100)', () => {
    const result = transformDiscount(makeCoupon({ discount_type: 'fixed', discount_value: 25 }))
    // 25 SAR = 2500 halalas
    expect(result.value).toBe(2500)
  })

  it('sets appliesTo ORDER for percentage type', () => {
    const result = transformDiscount(makeCoupon({ discount_type: 'percentage' }))
    expect(result.appliesTo).toBe('ORDER')
  })

  it('sets appliesTo SHIPPING for free_shipping type', () => {
    const result = transformDiscount(makeCoupon({ discount_type: 'free_shipping' }))
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('converts minimum_order_amount to minor units', () => {
    const result = transformDiscount(makeCoupon({ minimum_order_amount: 100 }))
    // 100 SAR = 10000 halalas
    expect(result.minimumPurchaseAmount).toEqual({ amount: 10000, currency: 'SAR' })
  })

  it('leaves minimumPurchaseAmount undefined when minimum_order_amount is 0', () => {
    const result = transformDiscount(makeCoupon({ minimum_order_amount: 0 }))
    expect(result.minimumPurchaseAmount).toBeUndefined()
  })

  it('maps usage_limit and used_count', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.usageLimit).toBe(50)
    expect(result.usageCount).toBe(3)
  })

  it('maps starts_at and expires_at', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.startsAt).toBe('2026-06-01T00:00:00Z')
    expect(result.endsAt).toBe('2026-08-31T23:59:59Z')
  })

  it('maps created_at', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.createdAt).toBe('2026-05-01T00:00:00Z')
  })

  it('falls back to code when title is absent', () => {
    const result = transformDiscount(makeCoupon({ title: null }))
    expect(result.title).toBe('SUMMER10')
  })

  it('stores raw in metadata', () => {
    const raw = makeCoupon()
    const result = transformDiscount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying DiscountSchema', () => {
    const result = transformDiscount(makeCoupon())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })
})

describe('untransformDiscount (Zid)', () => {
  it('maps percentage type back to lowercase', () => {
    const body = untransformDiscount({ code: 'TEST', type: 'PERCENTAGE', value: 10 })
    expect(body.discount_type).toBe('percentage')
    expect(body.discount_value).toBe(10)
  })

  it('maps FREE_SHIPPING type back', () => {
    const body = untransformDiscount({ code: 'SHIP', type: 'FREE_SHIPPING' })
    expect(body.discount_type).toBe('free_shipping')
  })

  it('converts FIXED_AMOUNT value back to major units', () => {
    const body = untransformDiscount({
      code: 'FIXED',
      type: 'FIXED_AMOUNT',
      value: 2500,
      currency: 'SAR',
    })
    // 2500 halalas = 25 SAR
    expect(body.discount_value).toBe(25)
  })

  it('maps usage_limit', () => {
    const body = untransformDiscount({ usageLimit: 100 })
    expect(body.usage_limit).toBe(100)
  })
})
