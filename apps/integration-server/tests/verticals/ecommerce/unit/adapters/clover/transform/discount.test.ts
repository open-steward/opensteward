import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawCloverDiscount,
} from '../../../../../../../src/verticals/ecommerce/adapters/clover/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makePercentageDiscount(overrides: Partial<RawCloverDiscount> = {}): RawCloverDiscount {
  return {
    id: 'DISC_001',
    name: '10% Off',
    percentage: 10,
    modifiedTime: 1706745600000,
    ...overrides,
  }
}

function makeFixedDiscount(overrides: Partial<RawCloverDiscount> = {}): RawCloverDiscount {
  return {
    id: 'DISC_002',
    name: '$5 Off',
    amount: -500,
    modifiedTime: 1706745600000,
    ...overrides,
  }
}

describe('transformDiscount (Clover)', () => {
  it('maps percentage discount', () => {
    const result = transformDiscount(makePercentageDiscount())
    expect(result.id).toBe('DISC_001')
    expect(result.title).toBe('10% Off')
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
    expect(result.currency).toBeUndefined()
  })

  it('maps fixed-amount discount', () => {
    const result = transformDiscount(makeFixedDiscount())
    expect(result.id).toBe('DISC_002')
    expect(result.title).toBe('$5 Off')
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(500)
    expect(result.currency).toBe('USD')
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

  it('handles discount with no type info', () => {
    const result = transformDiscount({ id: 'DISC_NONE' })
    expect(result.type).toBeUndefined()
    expect(result.value).toBeUndefined()
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })
})

describe('untransformDiscount (Clover)', () => {
  it('round-trips percentage discount', () => {
    const raw = untransformDiscount({ title: '10% Off', type: 'PERCENTAGE', value: 10 })
    expect(raw['name']).toBe('10% Off')
    expect(raw['percentage']).toBe(10)
    expect(raw['amount']).toBeUndefined()
  })

  it('round-trips fixed discount as negative cents', () => {
    const raw = untransformDiscount({ title: '$5 Off', type: 'FIXED_AMOUNT', value: 500 })
    expect(raw['name']).toBe('$5 Off')
    expect(raw['amount']).toBe(-500)
    expect(raw['percentage']).toBeUndefined()
  })
})
