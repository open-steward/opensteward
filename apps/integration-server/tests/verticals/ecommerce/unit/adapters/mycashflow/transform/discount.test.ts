import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  type RawMyCashflowCampaign,
} from '../../../../../../../src/verticals/ecommerce/adapters/mycashflow/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeRaw(overrides: Partial<RawMyCashflowCampaign> = {}): RawMyCashflowCampaign {
  return {
    id: 10,
    published: true,
    conditions: {
      starts_at: '2024-03-01T00:00:00Z',
      ends_at: '2024-03-31T00:00:00Z',
      promo_codes: [{ code: 'SPRING10', use_limit: 100, used_count: 5 }],
      minimum_cart_amount: 50,
    },
    discounts: {
      type: 'percentage',
      value: 10,
      currency: 'EUR',
      product_ids: [],
      category_ids: [],
    },
    translations: [{ language: 'fi', title: 'Kevät-10% alennus' }],
    created_at: '2024-02-15T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformDiscount (MyCashflow)', () => {
  it('maps id to string canonical id', () => {
    const result = transformDiscount(makeRaw())
    expect(result.id).toBe('10')
  })

  it('maps percentage type discount correctly', () => {
    const result = transformDiscount(makeRaw())
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
  })

  it('maps fixed_amount type and converts to minor units', () => {
    const result = transformDiscount(
      makeRaw({ discounts: { type: 'fixed_amount', value: 15, currency: 'EUR' } }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    // EUR 2 decimal digits → 15 × 100 = 1500
    expect(result.value).toBe(1500)
  })

  it('maps free_shipping type', () => {
    const result = transformDiscount(makeRaw({ discounts: { type: 'free_shipping', value: 0 } }))
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps ORDER appliesTo when no product/category targets', () => {
    const result = transformDiscount(makeRaw())
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps PRODUCTS appliesTo when product_ids are present', () => {
    const result = transformDiscount(
      makeRaw({ discounts: { type: 'percentage', value: 5, product_ids: [1, 2] } }),
    )
    expect(result.appliesTo).toBe('PRODUCTS')
    expect(result.productIds).toEqual(['1', '2'])
  })

  it('extracts promo code from conditions.promo_codes', () => {
    const result = transformDiscount(makeRaw())
    expect(result.code).toBe('SPRING10')
    expect(result.usageLimit).toBe(100)
    expect(result.usageCount).toBe(5)
  })

  it('picks Finnish translation as title', () => {
    const result = transformDiscount(makeRaw())
    expect(result.title).toBe('Kevät-10% alennus')
  })

  it('maps minimumPurchaseAmount from minimum_cart_amount', () => {
    const result = transformDiscount(makeRaw())
    // EUR 2 decimal digits → 50 × 100 = 5000
    expect(result.minimumPurchaseAmount).toEqual({ amount: 5000, currency: 'EUR' })
  })

  it('maps startsAt and endsAt', () => {
    const result = transformDiscount(makeRaw())
    expect(result.startsAt).toBe('2024-03-01T00:00:00Z')
    expect(result.endsAt).toBe('2024-03-31T00:00:00Z')
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    const result = transformDiscount(makeRaw())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })
})
