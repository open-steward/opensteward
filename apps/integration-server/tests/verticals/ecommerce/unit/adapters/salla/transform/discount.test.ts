import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawSallaCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/salla/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeCoupon(overrides: Partial<RawSallaCoupon> = {}): RawSallaCoupon {
  return {
    id: 701,
    code: 'WELCOME15',
    type: 'percentage',
    status: 'active',
    amount: { amount: 15, currency: 'SAR' },
    minimum_amount: { amount: 50, currency: 'SAR' },
    usage_limit: 200,
    usage_count: 12,
    start_date: '2024-01-01T00:00:00Z',
    expiry_date: '2024-12-31T23:59:59Z',
    ...overrides,
  }
}

describe('transformDiscount', () => {
  it('maps id, code', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.id).toBe('701')
    expect(result.code).toBe('WELCOME15')
  })

  it('maps percentage type and preserves value', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(15)
  })

  it('maps fixed type and converts value to minor units', () => {
    const result = transformDiscount(
      makeCoupon({ type: 'fixed', amount: { amount: 25, currency: 'SAR' } }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(2500)
  })

  it('maps free_shipping type via free_shipping flag', () => {
    const result = transformDiscount(makeCoupon({ free_shipping: true, type: null }))
    expect(result.type).toBe('FREE_SHIPPING')
  })

  it('maps minimum purchase amount to minor units', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.minimumPurchaseAmount).toEqual({ amount: 5000, currency: 'SAR' })
  })

  it('maps usage limits', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.usageLimit).toBe(200)
    expect(result.usageCount).toBe(12)
  })

  it('maps start and expiry dates', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.startsAt).toBe('2024-01-01T00:00:00.000Z')
    expect(result.endsAt).toBe('2024-12-31T23:59:59.000Z')
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
    const canonical = transformDiscount(makeCoupon())
    const raw = untransformDiscount(canonical)
    expect(raw.code).toBe('WELCOME15')
    expect(raw.type).toBe('percentage')
  })
})
