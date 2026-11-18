import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawScapiPromotion,
} from '../../../../../../../src/verticals/ecommerce/adapters/salesforce-commerce-cloud/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makePromotion(overrides: Partial<RawScapiPromotion> = {}): RawScapiPromotion {
  return {
    id: 'promo-summer10',
    name: 'Summer 10% Off',
    enabled: true,
    couponBased: true,
    coupon: { id: 'cpn-1', code: 'SUMMER10' },
    discount: { type: 'percentage', amount: 10 },
    startDate: '2024-06-01T00:00:00Z',
    endDate: '2024-08-31T23:59:59Z',
    currency: 'USD',
    ...overrides,
  }
}

describe('transformDiscount', () => {
  it('maps id, code, and title', () => {
    const result = transformDiscount(makePromotion())
    expect(result.id).toBe('promo-summer10')
    expect(result.code).toBe('SUMMER10')
    expect(result.title).toBe('Summer 10% Off')
  })

  it('maps percentage discount type and value', () => {
    const result = transformDiscount(makePromotion())
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
  })

  it('maps fixed_amount type and converts to minor units', () => {
    const result = transformDiscount(
      makePromotion({ discount: { type: 'fixed', amount: 25.0 }, couponBased: false, coupon: null }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(2500)
  })

  it('maps free_shipping type', () => {
    const result = transformDiscount(
      makePromotion({ discount: { type: 'free_shipping' }, couponBased: false, coupon: null }),
    )
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps appliesTo ORDER for non-shipping discounts', () => {
    const result = transformDiscount(makePromotion())
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps start and end dates', () => {
    const result = transformDiscount(makePromotion())
    expect(result.startsAt).toBe('2024-06-01T00:00:00.000Z')
    expect(result.endsAt).toBe('2024-08-31T23:59:59.000Z')
  })

  it('omits code when not couponBased', () => {
    const result = transformDiscount(
      makePromotion({ couponBased: false, coupon: null }),
    )
    expect(result.code).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makePromotion()
    const result = transformDiscount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    const result = transformDiscount(makePromotion())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformDiscount', () => {
    const canonical = transformDiscount(makePromotion())
    const raw = untransformDiscount(canonical)
    expect(raw.name).toBe('Summer 10% Off')
    expect((raw.discount as { type: string }).type).toBe('percentage')
  })
})
