import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawLoyverseDiscount,
} from '../../../../../../../src/verticals/ecommerce/adapters/loyverse/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeRaw(overrides: Partial<RawLoyverseDiscount> = {}): RawLoyverseDiscount {
  return {
    id: 'disc_001',
    type: 'PERCENT',
    name: 'Summer Sale',
    discount_percent: 15,
    created_at: '2024-06-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformDiscount (Loyverse)', () => {
  it('maps id and title from name', () => {
    const result = transformDiscount(makeRaw())
    expect(result.id).toBe('disc_001')
    expect(result.title).toBe('Summer Sale')
  })

  it('sets code to name (POS staff-applied)', () => {
    const result = transformDiscount(makeRaw())
    expect(result.code).toBe('Summer Sale')
  })

  it('maps PERCENT type to PERCENTAGE', () => {
    const result = transformDiscount(makeRaw({ type: 'PERCENT' }))
    expect(result.type).toBe('PERCENTAGE')
  })

  it('maps AMOUNT type to FIXED_AMOUNT', () => {
    const result = transformDiscount(makeRaw({ type: 'AMOUNT', discount_amount: 5.0 }))
    expect(result.type).toBe('FIXED_AMOUNT')
  })

  it('maps percent value directly for PERCENTAGE discount', () => {
    const result = transformDiscount(makeRaw({ type: 'PERCENT', discount_percent: 15 }))
    expect(result.value).toBe(15)
  })

  it('converts discount_amount to minor units for FIXED_AMOUNT discount', () => {
    const result = transformDiscount(
      makeRaw({ type: 'AMOUNT', discount_amount: 5.0, discount_percent: undefined }),
    )
    expect(result.value).toBe(500)
  })

  it('sets appliesTo to ORDER', () => {
    const result = transformDiscount(makeRaw())
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps createdAt', () => {
    const result = transformDiscount(makeRaw())
    expect(result.createdAt).toBe('2024-06-01T00:00:00Z')
  })

  it('handles unknown type gracefully', () => {
    const result = transformDiscount(makeRaw({ type: 'BOGO' }))
    expect(result.type).toBeUndefined()
    expect(result.value).toBeUndefined()
  })

  it('produces schema-valid output for PERCENTAGE discount', () => {
    const result = transformDiscount(makeRaw())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('produces schema-valid output for FIXED_AMOUNT discount', () => {
    const result = transformDiscount(makeRaw({ type: 'AMOUNT', discount_amount: 10.0 }))
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })
})

describe('untransformDiscount (Loyverse)', () => {
  it('maps PERCENTAGE back to PERCENT type', () => {
    const result = untransformDiscount({ type: 'PERCENTAGE', value: 15, title: 'Summer Sale' })
    expect(result.type).toBe('PERCENT')
    expect(result.discount_percent).toBe(15)
    expect(result.name).toBe('Summer Sale')
  })

  it('maps FIXED_AMOUNT back to AMOUNT type and converts minor→major units', () => {
    const result = untransformDiscount({ type: 'FIXED_AMOUNT', value: 500, title: 'Five Off' })
    expect(result.type).toBe('AMOUNT')
    expect(result.discount_amount).toBe(5)
  })
})
