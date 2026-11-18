import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawJtlShopCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/jtl-shop/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

describe('transformDiscount (jtl-shop)', () => {
  const raw: RawJtlShopCoupon = {
    id: 99,
    code: 'SAVE10',
    name: 'Save 10% On Orders',
    title: 'Save 10%',
    type: 'percentage',
    value: 10,
    currency: 'EUR',
    minimumOrderValue: 50,
    usageLimit: 200,
    usageCount: 12,
    customerEligibility: 'all',
    validFrom: '2024-03-01T00:00:00Z',
    validUntil: '2024-12-31T00:00:00Z',
    created: '2024-03-01T00:00:00Z',
  }

  it('maps id to string', () => {
    const result = transformDiscount(raw)
    expect(result.id).toBe('99')
  })

  it('maps code', () => {
    const result = transformDiscount(raw)
    expect(result.code).toBe('SAVE10')
  })

  it('maps title (prefers title over name)', () => {
    const result = transformDiscount(raw)
    expect(result.title).toBe('Save 10%')
  })

  it('maps type percentage → PERCENTAGE', () => {
    const result = transformDiscount(raw)
    expect(result.type).toBe('PERCENTAGE')
  })

  it('keeps percentage value as-is (not converted to minor units)', () => {
    const result = transformDiscount(raw)
    expect(result.value).toBe(10)
  })

  it('maps appliesTo ORDER when no productIds/categoryIds', () => {
    const result = transformDiscount(raw)
    expect(result.appliesTo).toBe('ORDER')
  })

  it('converts minimumOrderValue to Money minor units', () => {
    const result = transformDiscount(raw)
    // 50 EUR → 5000 cents
    expect(result.minimumPurchaseAmount).toEqual({ amount: 5000, currency: 'EUR' })
  })

  it('maps usageLimit and usageCount', () => {
    const result = transformDiscount(raw)
    expect(result.usageLimit).toBe(200)
    expect(result.usageCount).toBe(12)
  })

  it('maps customerEligibility all → ALL', () => {
    const result = transformDiscount(raw)
    expect(result.customerEligibility).toBe('ALL')
  })

  it('maps startsAt from validFrom and endsAt from validUntil', () => {
    const result = transformDiscount(raw)
    expect(result.startsAt).toBe('2024-03-01T00:00:00Z')
    expect(result.endsAt).toBe('2024-12-31T00:00:00Z')
  })

  it('produces schema-valid output', () => {
    const result = transformDiscount(raw)
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('maps fixed type → FIXED_AMOUNT and converts value to minor units', () => {
    const result = transformDiscount({ ...raw, type: 'fixed', value: 15.0 })
    expect(result.type).toBe('FIXED_AMOUNT')
    // 15.00 EUR → 1500 cents
    expect(result.value).toBe(1500)
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('maps shipping type → FREE_SHIPPING', () => {
    const result = transformDiscount({ ...raw, type: 'shipping', value: 0 })
    expect(result.type).toBe('FREE_SHIPPING')
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformDiscount', () => {
    const result = transformDiscount(raw)
    const back = untransformDiscount(result)
    expect(back.code).toBe(raw.code)
    expect(back.type).toBe('percentage')
    expect(back.value).toBe(10)
  })
})
