import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawBCPromotion,
} from '../../../../../../../src/verticals/ecommerce/adapters/bettercommerce/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makePromotion(overrides: Partial<RawBCPromotion> = {}): RawBCPromotion {
  return {
    promoId: 'promo-001',
    promoCode: 'WELCOME10',
    name: 'Welcome 10% Off',
    discountType: 'percentage',
    discountValue: 10,
    applicability: 'order',
    currencyCode: 'GBP',
    minimumOrderValue: 50,
    usageLimit: 1000,
    usageCount: 5,
    customerEligibility: 'all',
    startDate: '2024-01-01T00:00:00Z',
    endDate: '2024-12-31T23:59:59Z',
    createdAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformDiscount (BetterCommerce)', () => {
  it('maps promoId to id', () => {
    const result = transformDiscount(makePromotion({ promoId: 'promo-001' }))
    expect(result.id).toBe('promo-001')
  })

  it('falls back to recordId', () => {
    const result = transformDiscount(makePromotion({ promoId: undefined, recordId: 'rec-abc' }))
    expect(result.id).toBe('rec-abc')
  })

  it('maps promoCode to code', () => {
    const result = transformDiscount(makePromotion())
    expect(result.code).toBe('WELCOME10')
  })

  it('maps name to title', () => {
    const result = transformDiscount(makePromotion())
    expect(result.title).toBe('Welcome 10% Off')
  })

  it('maps discountType=percentage to PERCENTAGE', () => {
    const result = transformDiscount(makePromotion({ discountType: 'percentage' }))
    expect(result.type).toBe('PERCENTAGE')
  })

  it('maps discountType=fixed to FIXED_AMOUNT', () => {
    const result = transformDiscount(makePromotion({ discountType: 'fixed', discountValue: 10 }))
    expect(result.type).toBe('FIXED_AMOUNT')
  })

  it('maps discountType=freeshipping to FREE_SHIPPING', () => {
    const result = transformDiscount(makePromotion({ discountType: 'freeshipping' }))
    expect(result.type).toBe('FREE_SHIPPING')
  })

  it('keeps percentage value as-is', () => {
    const result = transformDiscount(
      makePromotion({ discountType: 'percentage', discountValue: 10 }),
    )
    expect(result.value).toBe(10)
  })

  it('converts fixed amount to minor units (GBP)', () => {
    const result = transformDiscount(
      makePromotion({ discountType: 'fixed', discountValue: 10, currencyCode: 'GBP' }),
    )
    expect(result.value).toBe(1000)
  })

  it('maps applicability=order to ORDER', () => {
    const result = transformDiscount(makePromotion({ applicability: 'order' }))
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps applicability=product to PRODUCTS', () => {
    const result = transformDiscount(makePromotion({ applicability: 'product' }))
    expect(result.appliesTo).toBe('PRODUCTS')
  })

  it('maps applicability=shipping to SHIPPING', () => {
    const result = transformDiscount(makePromotion({ applicability: 'shipping' }))
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps minimumOrderValue to minimumPurchaseAmount in minor units', () => {
    const result = transformDiscount(makePromotion({ minimumOrderValue: 50, currencyCode: 'GBP' }))
    expect(result.minimumPurchaseAmount?.amount).toBe(5000)
    expect(result.minimumPurchaseAmount?.currency).toBe('GBP')
  })

  it('maps usageLimit', () => {
    const result = transformDiscount(makePromotion({ usageLimit: 1000 }))
    expect(result.usageLimit).toBe(1000)
  })

  it('maps usageCount', () => {
    const result = transformDiscount(makePromotion({ usageCount: 5 }))
    expect(result.usageCount).toBe(5)
  })

  it('maps customerEligibility=all to ALL', () => {
    const result = transformDiscount(makePromotion({ customerEligibility: 'all' }))
    expect(result.customerEligibility).toBe('ALL')
  })

  it('maps customerEligibility=specific to SPECIFIC', () => {
    const result = transformDiscount(makePromotion({ customerEligibility: 'specific' }))
    expect(result.customerEligibility).toBe('SPECIFIC')
  })

  it('maps startsAt and endsAt', () => {
    const result = transformDiscount(makePromotion())
    expect(result.startsAt).toBe('2024-01-01T00:00:00Z')
    expect(result.endsAt).toBe('2024-12-31T23:59:59Z')
  })

  it('stores raw in metadata', () => {
    const raw = makePromotion()
    const result = transformDiscount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying DiscountSchema', () => {
    const result = transformDiscount(makePromotion())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })
})

describe('untransformDiscount (BetterCommerce)', () => {
  it('maps PERCENTAGE type to percentage', () => {
    const body = untransformDiscount({ type: 'PERCENTAGE', value: 10 })
    expect(body.discountType).toBe('percentage')
  })

  it('maps FIXED_AMOUNT type to fixed', () => {
    const body = untransformDiscount({ type: 'FIXED_AMOUNT', value: 1000 })
    expect(body.discountType).toBe('fixed')
  })

  it('maps FREE_SHIPPING type to freeshipping', () => {
    const body = untransformDiscount({ type: 'FREE_SHIPPING' })
    expect(body.discountType).toBe('freeshipping')
  })

  it('maps code to promoCode', () => {
    const body = untransformDiscount({ code: 'PROMO10' })
    expect(body.promoCode).toBe('PROMO10')
  })
})
