import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawFoxyCoupon,
  type RawFoxyCouponCode,
} from '../../../../../../../src/verticals/ecommerce/adapters/foxy-io/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeCoupon(overrides: Partial<RawFoxyCoupon> = {}): RawFoxyCoupon {
  return {
    id: 100,
    name: 'Summer Sale',
    coupon_discount_type: 'price_percentage',
    coupon_discount_details: '1-15',
    start_date: '2024-03-01T00:00:00Z',
    end_date: '2024-06-01T00:00:00Z',
    number_of_uses_allowed: 50,
    number_of_uses_to_date: 3,
    date_created: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

function makeCode(overrides: Partial<RawFoxyCouponCode> = {}): RawFoxyCouponCode {
  return {
    id: 200,
    code: 'SUMMER15',
    number_of_uses_to_date: 3,
    ...overrides,
  }
}

describe('transformDiscount (Foxy.io)', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformDiscount(makeCoupon(), makeCode())
    expect(result.id).toBe('100')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Summer Sale')
    expect(result.code).toBe('SUMMER15')
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps price_percentage type and passes value through as-is', () => {
    const result = transformDiscount(makeCoupon({ coupon_discount_details: '1-15' }))
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(15)
  })

  it('maps price_amount type and converts major units to minor', () => {
    const result = transformDiscount(
      makeCoupon({ coupon_discount_type: 'price_amount', coupon_discount_details: '1-5.00' }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    // 5.00 USD → 500 minor units
    expect(result.value).toBe(500)
  })

  it('maps free_shipping type', () => {
    const result = transformDiscount(
      makeCoupon({ coupon_discount_type: 'free_shipping', coupon_discount_details: null }),
    )
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.value).toBeUndefined()
  })

  it('maps externally_controlled type to undefined', () => {
    const result = transformDiscount(
      makeCoupon({ coupon_discount_type: 'externally_controlled', coupon_discount_details: null }),
    )
    expect(result.type).toBeUndefined()
  })

  it('uses coupon usageCount when code is absent', () => {
    const result = transformDiscount(makeCoupon({ number_of_uses_to_date: 7 }))
    expect(result.usageCount).toBe(7)
  })

  it('prefers coupon usageCount over code when both present', () => {
    const result = transformDiscount(
      makeCoupon({ number_of_uses_to_date: 10 }),
      makeCode({ number_of_uses_to_date: 99 }),
    )
    // Source: usageCount: coupon.number_of_uses_to_date ?? code?.number_of_uses_to_date
    expect(result.usageCount).toBe(10)
  })

  it('stores coupon + code in metadata', () => {
    const coupon = makeCoupon()
    const code = makeCode()
    const result = transformDiscount(coupon, code)
    const meta = result.metadata as { coupon: unknown; code: unknown }
    expect(meta.coupon).toBe(coupon)
    expect(meta.code).toBe(code)
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    const result = transformDiscount(makeCoupon(), makeCode())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformDiscount', () => {
    const canonical = transformDiscount(makeCoupon(), makeCode())
    const back = untransformDiscount(canonical)
    expect(back.coupon_discount_type).toBe('price_percentage')
    expect(back.name).toBe('Summer Sale')
  })
})
