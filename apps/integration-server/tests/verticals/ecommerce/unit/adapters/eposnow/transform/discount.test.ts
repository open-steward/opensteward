import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawEposNowDiscount,
} from '../../../../../../../src/verticals/ecommerce/adapters/eposnow/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makePercentageDiscount(overrides: Partial<RawEposNowDiscount> = {}): RawEposNowDiscount {
  return {
    Id: 2001,
    Name: '10% Off',
    DiscountType: 0,
    Value: 10,
    Active: true,
    CreatedDate: '2024-03-01T09:00:00Z',
    ...overrides,
  }
}

function makeFixedDiscount(overrides: Partial<RawEposNowDiscount> = {}): RawEposNowDiscount {
  return {
    Id: 2002,
    Name: '5 Off',
    DiscountType: 1,
    Value: 5,
    Active: true,
    CreatedDate: '2024-03-01T09:00:00Z',
    ...overrides,
  }
}

describe('transformDiscount (Epos Now)', () => {
  it('maps percentage discount', () => {
    const result = transformDiscount(makePercentageDiscount())
    expect(result.id).toBe('2001')
    expect(result.title).toBe('10% Off')
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
    expect(result.currency).toBeUndefined()
  })

  it('maps fixed-amount discount', () => {
    const result = transformDiscount(makeFixedDiscount())
    expect(result.id).toBe('2002')
    expect(result.title).toBe('5 Off')
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(5)
    expect(result.currency).toBe('GBP')
  })

  it('maps createdAt', () => {
    const result = transformDiscount(makePercentageDiscount())
    expect(result.createdAt).toBe('2024-03-01T09:00:00Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makePercentageDiscount()
    const result = transformDiscount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    const result = transformDiscount(makePercentageDiscount())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('handles discount with unknown type', () => {
    const result = transformDiscount({ Id: 9999, DiscountType: 5 })
    expect(result.type).toBeUndefined()
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })
})

describe('untransformDiscount (Epos Now)', () => {
  it('round-trips percentage discount', () => {
    const raw = untransformDiscount({ title: '10% Off', type: 'PERCENTAGE', value: 10 })
    expect(raw['Name']).toBe('10% Off')
    expect(raw['DiscountType']).toBe(0)
    expect(raw['Value']).toBe(10)
  })

  it('round-trips fixed discount', () => {
    const raw = untransformDiscount({ title: '5 Off', type: 'FIXED_AMOUNT', value: 5 })
    expect(raw['Name']).toBe('5 Off')
    expect(raw['DiscountType']).toBe(1)
    expect(raw['Value']).toBe(5)
  })
})
