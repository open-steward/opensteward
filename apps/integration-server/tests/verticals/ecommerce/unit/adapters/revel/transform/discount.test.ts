import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawRevelDiscount,
} from '../../../../../../../src/verticals/ecommerce/adapters/revel/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeDiscount(overrides: Partial<RawRevelDiscount> = {}): RawRevelDiscount {
  return {
    id: 700,
    name: '10% Off',
    value: 10,
    type: 0, // percentage
    active: true,
    created_date: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformDiscount (Revel)', () => {
  it('maps percentage discount', () => {
    const result = transformDiscount(makeDiscount({ type: 0, value: 10 }))
    expect(result.id).toBe('700')
    expect(result.title).toBe('10% Off')
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
    expect(result.currency).toBeUndefined()
  })

  it('maps fixed amount discount', () => {
    const result = transformDiscount(makeDiscount({ type: 1, value: 5.0, name: '$5 Off' }))
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(5.0)
    expect(result.currency).toBe('USD')
  })

  it('maps appliesTo and customerEligibility', () => {
    const result = transformDiscount(makeDiscount())
    expect(result.appliesTo).toBe('ORDER')
    expect(result.customerEligibility).toBe('ALL')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeDiscount()
    const result = transformDiscount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    const result = transformDiscount(makeDiscount())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('handles missing optional fields', () => {
    const minimal: RawRevelDiscount = { id: 999 }
    const result = transformDiscount(minimal)
    expect(result.id).toBe('999')
    expect(result.type).toBeUndefined()
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })
})

describe('untransformDiscount (Revel)', () => {
  it('maps percentage discount', () => {
    const raw = untransformDiscount({ title: '20% Off', type: 'PERCENTAGE', value: 20 })
    expect(raw['name']).toBe('20% Off')
    expect(raw['type']).toBe(0)
    expect(raw['value']).toBe(20)
  })

  it('maps fixed amount discount', () => {
    const raw = untransformDiscount({ title: '$10 Off', type: 'FIXED_AMOUNT', value: 10 })
    expect(raw['name']).toBe('$10 Off')
    expect(raw['type']).toBe(1)
    expect(raw['value']).toBe(10)
  })
})
