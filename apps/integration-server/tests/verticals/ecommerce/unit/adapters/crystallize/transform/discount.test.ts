import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawCrystallizeDiscount,
} from '../../../../../../../src/verticals/ecommerce/adapters/crystallize/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeDiscount(overrides: Partial<RawCrystallizeDiscount> = {}): RawCrystallizeDiscount {
  return {
    id: 'disc-001',
    name: 'Summer Sale',
    code: 'SUMMER20',
    type: 'percentage',
    value: 20,
    currency: 'USD',
    appliesTo: 'order',
    productIds: null,
    usageLimit: 100,
    usageCount: 42,
    startsAt: '2024-06-01T00:00:00.000Z',
    endsAt: '2024-08-31T23:59:59.000Z',
    createdAt: '2024-05-15T09:00:00.000Z',
    ...overrides,
  }
}

describe('transformDiscount (Crystallize)', () => {
  it('maps core fields', () => {
    const result = transformDiscount(makeDiscount())
    expect(result.id).toBe('disc-001')
    expect(result.title).toBe('Summer Sale')
    expect(result.code).toBe('SUMMER20')
    expect(result.value).toBe(20)
    expect(result.currency).toBe('USD')
  })

  it('maps type correctly', () => {
    expect(transformDiscount(makeDiscount({ type: 'percentage' })).type).toBe('PERCENTAGE')
    expect(transformDiscount(makeDiscount({ type: 'fixed' })).type).toBe('FIXED_AMOUNT')
    expect(transformDiscount(makeDiscount({ type: 'fixed_amount' })).type).toBe('FIXED_AMOUNT')
    expect(transformDiscount(makeDiscount({ type: 'free_shipping' })).type).toBe('FREE_SHIPPING')
  })

  it('maps appliesTo correctly', () => {
    expect(transformDiscount(makeDiscount({ appliesTo: 'order' })).appliesTo).toBe('ORDER')
    expect(transformDiscount(makeDiscount({ appliesTo: 'products' })).appliesTo).toBe('PRODUCTS')
    expect(transformDiscount(makeDiscount({ appliesTo: 'shipping' })).appliesTo).toBe('SHIPPING')
  })

  it('maps usage limits', () => {
    const result = transformDiscount(makeDiscount())
    expect(result.usageLimit).toBe(100)
    expect(result.usageCount).toBe(42)
  })

  it('maps date range', () => {
    const result = transformDiscount(makeDiscount())
    expect(result.startsAt).toBe('2024-06-01T00:00:00.000Z')
    expect(result.endsAt).toBe('2024-08-31T23:59:59.000Z')
  })

  it('handles null fields', () => {
    const result = transformDiscount(makeDiscount({
      name: null,
      code: null,
      value: null,
      usageLimit: null,
    }))
    expect(result.title).toBeUndefined()
    expect(result.code).toBeUndefined()
    expect(result.value).toBeUndefined()
    expect(result.usageLimit).toBeUndefined()
  })

  it('maps product ids', () => {
    const result = transformDiscount(makeDiscount({ productIds: ['p1', 'p2'] }))
    expect(result.productIds).toEqual(['p1', 'p2'])
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

  it('round-trips writable fields via untransformDiscount', () => {
    const canonical = transformDiscount(makeDiscount())
    const raw = untransformDiscount(canonical)
    expect(raw['name']).toBe('Summer Sale')
    expect(raw['code']).toBe('SUMMER20')
    expect(raw['type']).toBe('percentage')
    expect(raw['value']).toBe(20)
    expect(raw['appliesTo']).toBe('order')
  })
})
