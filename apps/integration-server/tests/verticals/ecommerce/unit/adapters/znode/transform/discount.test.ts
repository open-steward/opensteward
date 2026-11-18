import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawZnodePromotion,
} from '../../../../../../../src/verticals/ecommerce/adapters/znode/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makePromotion(overrides: Partial<RawZnodePromotion> = {}): RawZnodePromotion {
  return {
    PromotionId: 200,
    PromotionName: 'Summer B2B Sale',
    Description: '10% off for all B2B customers',
    IsActive: true,
    CouponCode: 'SUMMER2024',
    DiscountType: 'Percentage',
    DiscountAmount: 10,
    CurrencyCode: 'EUR',
    MinimumOrderAmount: 500,
    MaxUsage: 100,
    CurrentUsageCount: 42,
    StartDate: '2024-06-01T00:00:00.000Z',
    EndDate: '2024-09-01T00:00:00.000Z',
    CreatedDate: '2024-05-15T10:00:00.000Z',
    ...overrides,
  }
}

describe('transformDiscount (Znode)', () => {
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
    const result = transformDiscount(makePromotion({ DiscountType: 'FixedAmount' }))
    expect(result.type).toBe('FIXED_AMOUNT')
  })

  it('maps free shipping discount', () => {
    const result = transformDiscount(makePromotion({ DiscountType: 'FreeShipping' }))
    expect(result.type).toBe('FREE_SHIPPING')
  })

  it('maps buy x get y discount', () => {
    const result = transformDiscount(makePromotion({ DiscountType: 'BuyXGetY' }))
    expect(result.type).toBe('BUY_X_GET_Y')
  })

  it('maps appliesTo from AppliesTo field', () => {
    const result = transformDiscount(makePromotion({ AppliesTo: 'Order' }))
    expect(result.appliesTo).toBe('ORDER')
  })

  it('infers appliesTo from shipping discount type', () => {
    const result = transformDiscount(makePromotion({ DiscountType: 'FreeShipping' }))
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps minimum purchase amount', () => {
    const result = transformDiscount(makePromotion())
    expect(result.minimumPurchaseAmount).toEqual({ amount: 50000, currency: 'EUR' })
  })

  it('maps product ids', () => {
    const result = transformDiscount(makePromotion({ ProductIds: [1, 2, 3] }))
    expect(result.productIds).toEqual(['1', '2', '3'])
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
    }) as Record<string, unknown>
    expect(body['PromotionName']).toBe('Winter Sale')
    expect(body['DiscountType']).toBe('Percentage')
    expect(body['DiscountAmount']).toBe(15)
    expect(body['CouponCode']).toBe('WINTER')
  })
})
