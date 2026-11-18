import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawScaylePromotion,
} from '../../../../../../../src/verticals/ecommerce/adapters/scayle/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makePromotion(overrides: Partial<RawScaylePromotion> = {}): RawScaylePromotion {
  return {
    id: 'promo-abc-123',
    name: 'Summer 10% Off',
    type: 'percentage_discount',
    value: 10,
    currency: 'EUR',
    conditions: {
      minimumBasketAmount: 5000,
      currency: 'EUR',
    },
    startDate: '2024-06-01T00:00:00Z',
    endDate: '2024-08-31T23:59:59Z',
    active: true,
    usageLimit: 100,
    usageCount: 15,
    code: 'SUMMER10',
    ...overrides,
  }
}

describe('transformDiscount (SCAYLE)', () => {
  it('stringifies id', () => {
    const result = transformDiscount(makePromotion())
    expect(result.id).toBe('promo-abc-123')
  })

  it('maps name → title and code', () => {
    const result = transformDiscount(makePromotion())
    expect(result.title).toBe('Summer 10% Off')
    expect(result.code).toBe('SUMMER10')
  })

  it('maps percentage_discount type → PERCENTAGE', () => {
    const result = transformDiscount(makePromotion())
    expect(result.type).toBe('PERCENTAGE')
  })

  it('maps fixed_amount_discount type → FIXED_AMOUNT', () => {
    const result = transformDiscount(makePromotion({ type: 'fixed_amount_discount', value: 2000 }))
    expect(result.type).toBe('FIXED_AMOUNT')
  })

  it('maps free_shipping type → FREE_SHIPPING', () => {
    const result = transformDiscount(makePromotion({ type: 'free_shipping' }))
    expect(result.type).toBe('FREE_SHIPPING')
  })

  it('passes value through directly (already correct unit for SCAYLE)', () => {
    const result = transformDiscount(makePromotion())
    expect(result.value).toBe(10)
  })

  it('maps minimumBasketAmount to minimumPurchaseAmount (already in minor units)', () => {
    const result = transformDiscount(makePromotion())
    expect(result.minimumPurchaseAmount).toEqual({ amount: 5000, currency: 'EUR' })
  })

  it('maps startDate/endDate and usageLimit/usageCount', () => {
    const result = transformDiscount(makePromotion())
    expect(result.startsAt).toBe('2024-06-01T00:00:00Z')
    expect(result.endsAt).toBe('2024-08-31T23:59:59Z')
    expect(result.usageLimit).toBe(100)
    expect(result.usageCount).toBe(15)
  })

  it('maps ORDER appliesTo for non-shipping, non-product types', () => {
    const result = transformDiscount(makePromotion())
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps SHIPPING appliesTo for shipping type', () => {
    const result = transformDiscount(makePromotion({ type: 'free_shipping' }))
    expect(result.appliesTo).toBe('SHIPPING')
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
    expect(raw.type).toBe('percentage_discount')
    expect(raw.value).toBe(10)
  })
})
