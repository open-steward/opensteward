import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawShopwarePromotion,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopware-b2b/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makePromotion(overrides: Partial<RawShopwarePromotion> = {}): RawShopwarePromotion {
  return {
    id: 'promo-b2b-001',
    name: 'B2B Volume Discount',
    code: 'B2B-VOL-10',
    active: true,
    validFrom: '2024-01-01T00:00:00+00:00',
    validUntil: '2024-12-31T23:59:59+00:00',
    maxRedemptionsGlobal: 500,
    maxRedemptionsPerCustomer: 10,
    orderCount: 42,
    useCodes: true,
    discounts: [
      { id: 'd-1', scope: 'cart', type: 'percentage', value: 10 },
    ],
    createdAt: '2024-01-01T00:00:00+00:00',
    updatedAt: '2024-06-01T00:00:00+00:00',
    ...overrides,
  }
}

describe('transformDiscount (Shopware B2B)', () => {
  it('maps core fields', () => {
    const result = transformDiscount(makePromotion())
    expect(result.id).toBe('promo-b2b-001')
    expect(result.title).toBe('B2B Volume Discount')
    expect(result.code).toBe('B2B-VOL-10')
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
    expect(result.appliesTo).toBe('ORDER')
    expect(result.usageLimit).toBe(500)
    expect(result.usageCount).toBe(42)
  })

  it('maps FREE_SHIPPING for delivery scope', () => {
    const result = transformDiscount(makePromotion({
      discounts: [{ scope: 'delivery', type: 'percentage', value: 100 }],
    }))
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps FIXED_AMOUNT for absolute type', () => {
    const result = transformDiscount(makePromotion({
      discounts: [{ scope: 'cart', type: 'absolute', value: 50 }],
    }))
    expect(result.type).toBe('FIXED_AMOUNT')
  })

  it('maps PRODUCTS for set scope', () => {
    const result = transformDiscount(makePromotion({
      discounts: [{ scope: 'set', type: 'percentage', value: 15 }],
    }))
    expect(result.appliesTo).toBe('PRODUCTS')
  })

  it('handles null code', () => {
    const result = transformDiscount(makePromotion({ code: null }))
    expect(result.code).toBeUndefined()
  })

  it('preserves metadata and validates', () => {
    const raw = makePromotion()
    const result = transformDiscount(raw)
    expect(result.metadata).toBe(raw)
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })
})

describe('untransformDiscount (Shopware B2B)', () => {
  it('maps canonical to Shopware shape', () => {
    const body = untransformDiscount({
      title: 'B2B Spring Sale',
      code: 'SPRING-B2B',
      type: 'PERCENTAGE',
      value: 20,
      usageLimit: 100,
    })
    expect(body['name']).toBe('B2B Spring Sale')
    expect(body['code']).toBe('SPRING-B2B')
    expect(body['useCodes']).toBe(true)
    const discounts = body['discounts'] as Array<Record<string, unknown>>
    expect(discounts[0]!['type']).toBe('percentage')
    expect(discounts[0]!['value']).toBe(20)
  })

  it('maps FREE_SHIPPING correctly', () => {
    const body = untransformDiscount({
      type: 'FREE_SHIPPING',
      value: 100,
    })
    const discounts = body['discounts'] as Array<Record<string, unknown>>
    expect(discounts[0]!['scope']).toBe('delivery')
  })
})
