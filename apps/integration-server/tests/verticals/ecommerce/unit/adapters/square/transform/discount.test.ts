import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawSquareCatalogDiscount,
} from '../../../../../../../src/verticals/ecommerce/adapters/square/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeDiscount(overrides: Partial<RawSquareCatalogDiscount> = {}): RawSquareCatalogDiscount {
  return {
    id: 'DISC_001',
    type: 'DISCOUNT',
    discount_data: {
      name: '10% Off',
      discount_type: 'FIXED_PERCENTAGE',
      percentage: '10',
    },
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-06-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformDiscount (Square)', () => {
  it('maps percentage discount', () => {
    const result = transformDiscount(makeDiscount())
    expect(result.id).toBe('DISC_001')
    expect(result.title).toBe('10% Off')
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
    expect(result.appliesTo).toBe('ORDER')
    expect(result.customerEligibility).toBe('ALL')
  })

  it('maps fixed amount discount', () => {
    const result = transformDiscount(
      makeDiscount({
        discount_data: {
          name: '$5 Off',
          discount_type: 'FIXED_AMOUNT',
          amount_money: { amount: 500, currency: 'USD' },
        },
      }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(500)
    expect(result.currency).toBe('USD')
  })

  it('handles variable percentage discount', () => {
    const result = transformDiscount(
      makeDiscount({
        discount_data: {
          name: 'Custom %',
          discount_type: 'VARIABLE_PERCENTAGE',
          percentage: '15',
        },
      }),
    )
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(15)
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
    expect((raw['discount_data'] as Record<string, unknown>)['name']).toBe('10% Off')
    expect((raw['discount_data'] as Record<string, unknown>)['discount_type']).toBe('FIXED_PERCENTAGE')
    expect((raw['discount_data'] as Record<string, unknown>)['percentage']).toBe('10')
  })
})
