import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawBagyCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/bagy/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeCoupon(overrides: Partial<RawBagyCoupon> = {}): RawBagyCoupon {
  return {
    id: 30,
    code: 'PROMO10',
    type: 1, // percentage
    value: '10',
    minimum_value: '50.00',
    available: 1,
    times_used: 3,
    uses_limit: 100,
    date_start: '2024-01-01T00:00:00Z',
    date_end: '2024-12-31T23:59:59Z',
    created: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformDiscount (Bagy)', () => {
  it('maps id to string', () => {
    const result = transformDiscount(makeCoupon({ id: 99 }))
    expect(result.id).toBe('99')
  })

  it('maps code', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.code).toBe('PROMO10')
  })

  it('maps type=1 to PERCENTAGE', () => {
    const result = transformDiscount(makeCoupon({ type: 1 }))
    expect(result.type).toBe('PERCENTAGE')
  })

  it('maps type=2 to FIXED_AMOUNT', () => {
    const result = transformDiscount(makeCoupon({ type: 2 }))
    expect(result.type).toBe('FIXED_AMOUNT')
  })

  it('maps type=3 to FREE_SHIPPING', () => {
    const result = transformDiscount(makeCoupon({ type: 3 }))
    expect(result.type).toBe('FREE_SHIPPING')
  })

  it('keeps percentage value as-is (not converted to minor units)', () => {
    const result = transformDiscount(makeCoupon({ type: 1, value: '10' }))
    expect(result.value).toBe(10)
  })

  it('converts FIXED_AMOUNT value to minor units (BRL)', () => {
    const result = transformDiscount(makeCoupon({ type: 2, value: '25.00' }))
    expect(result.value).toBe(2500)
  })

  it('maps appliesTo ORDER for type=1', () => {
    const result = transformDiscount(makeCoupon({ type: 1 }))
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps appliesTo SHIPPING for type=3', () => {
    const result = transformDiscount(makeCoupon({ type: 3 }))
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps minimumPurchaseAmount in minor units', () => {
    const result = transformDiscount(makeCoupon({ minimum_value: '50.00' }))
    expect(result.minimumPurchaseAmount?.amount).toBe(5000)
    expect(result.minimumPurchaseAmount?.currency).toBe('BRL')
  })

  it('maps usageLimit from uses_limit', () => {
    const result = transformDiscount(makeCoupon({ uses_limit: 100 }))
    expect(result.usageLimit).toBe(100)
  })

  it('maps usageCount from times_used', () => {
    const result = transformDiscount(makeCoupon({ times_used: 3 }))
    expect(result.usageCount).toBe(3)
  })

  it('maps customerEligibility to ALL', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.customerEligibility).toBe('ALL')
  })

  it('stores raw in metadata', () => {
    const raw = makeCoupon()
    const result = transformDiscount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying DiscountSchema', () => {
    const result = transformDiscount(makeCoupon())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })
})

describe('untransformDiscount (Bagy)', () => {
  it('maps PERCENTAGE type to 1', () => {
    const body = untransformDiscount({ type: 'PERCENTAGE', value: 10 })
    expect(body.type).toBe(1)
  })

  it('maps FIXED_AMOUNT type to 2', () => {
    const body = untransformDiscount({ type: 'FIXED_AMOUNT', value: 2500 })
    expect(body.type).toBe(2)
  })

  it('maps FREE_SHIPPING type to 3', () => {
    const body = untransformDiscount({ type: 'FREE_SHIPPING' })
    expect(body.type).toBe(3)
  })

  it('converts FIXED_AMOUNT value from minor to major units string', () => {
    const body = untransformDiscount({ type: 'FIXED_AMOUNT', value: 2500 })
    expect(body.value).toBe('25.00')
  })

  it('always sets available to 1', () => {
    const body = untransformDiscount({ type: 'PERCENTAGE', value: 10 })
    expect(body.available).toBe(1)
  })
})
