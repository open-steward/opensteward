import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawOroPromotion,
} from '../../../../../../../src/verticals/ecommerce/adapters/orocommerce/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makePromotion(overrides: Partial<RawOroPromotion> = {}): RawOroPromotion {
  return {
    id: '200',
    name: 'Summer B2B Sale',
    description: '10% off for all B2B customers',
    enabled: true,
    useCoupons: true,
    couponCode: 'SUMMER2024',
    discountType: 'percentage',
    discountValue: 10,
    discountCurrency: 'EUR',
    minimumOrderAmount: 500,
    usageLimit: 100,
    timesUsed: 42,
    startDateTime: '2024-06-01T00:00:00.000Z',
    endDateTime: '2024-09-01T00:00:00.000Z',
    createdAt: '2024-05-15T10:00:00.000Z',
    _type: 'promotions',
    ...overrides,
  }
}

describe('transformDiscount (OroCommerce)', () => {
  it('maps core fields for a percentage discount', () => {
    const result = transformDiscount(makePromotion())
    expect(result.id).toBe('200')
    expect(result.code).toBe('SUMMER2024')
    expect(result.title).toBe('Summer B2B Sale')
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
    expect(result.currency).toBe('EUR')
    expect(result.usageLimit).toBe(100)
    expect(result.usageCount).toBe(42)
  })

  it('maps fixed amount discount', () => {
    const result = transformDiscount(makePromotion({ discountType: 'order_amount' }))
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps free shipping discount', () => {
    const result = transformDiscount(makePromotion({ discountType: 'shipping' }))
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps minimum purchase amount', () => {
    const result = transformDiscount(makePromotion())
    expect(result.minimumPurchaseAmount).toEqual({ amount: 50000, currency: 'EUR' })
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    const result = transformDiscount(makePromotion())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformDiscount', () => {
    const body = untransformDiscount({
      title: 'Winter Sale',
      code: 'WINTER',
      type: 'PERCENTAGE',
      value: 15,
    }) as { data: { type: string; attributes: Record<string, unknown> } }
    expect(body.data.type).toBe('promotions')
    expect(body.data.attributes['name']).toBe('Winter Sale')
    expect(body.data.attributes['discountType']).toBe('percentage')
    expect(body.data.attributes['discountValue']).toBe(15)
    expect(body.data.attributes['useCoupons']).toBe(true)
    expect(body.data.attributes['couponCode']).toBe('WINTER')
  })
})
