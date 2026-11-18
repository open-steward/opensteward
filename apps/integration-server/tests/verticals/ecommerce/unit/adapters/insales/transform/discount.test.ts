import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawInsalesDiscountCode,
} from '../../../../../../../src/verticals/ecommerce/adapters/insales/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeDiscountCode(overrides: Partial<RawInsalesDiscountCode> = {}): RawInsalesDiscountCode {
  return {
    id: 101,
    code: 'SAVE10',
    type_id: 1, // PERCENTAGE
    discount: '10',
    discount_value: null,
    uses_count: 3,
    uses_limit: 100,
    valid_till: '2024-12-31T23:59:59Z',
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformDiscount (insales)', () => {
  it('maps id as string and code', () => {
    const result = transformDiscount(makeDiscountCode())
    expect(result.id).toBe('101')
    expect(result.code).toBe('SAVE10')
  })

  it('maps type_id 1 → PERCENTAGE with value', () => {
    const result = transformDiscount(makeDiscountCode())
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
  })

  it('maps type_id 2 → FIXED_AMOUNT, converts discount_value to minor units', () => {
    const result = transformDiscount(
      makeDiscountCode({ type_id: 2, discount: null, discount_value: '500' }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    // 500 RUB → 50000 minor units
    expect(result.value).toBe(50000)
  })

  it('maps type_id 3 → FREE_SHIPPING with value 0', () => {
    const result = transformDiscount(makeDiscountCode({ type_id: 3, discount: null }))
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.value).toBe(0)
  })

  it('maps usageCount and usageLimit', () => {
    const result = transformDiscount(makeDiscountCode())
    expect(result.usageCount).toBe(3)
    expect(result.usageLimit).toBe(100)
  })

  it('maps endsAt from valid_till', () => {
    const result = transformDiscount(makeDiscountCode())
    expect(result.endsAt).toBe('2024-12-31T23:59:59Z')
  })

  it('maps createdAt', () => {
    const result = transformDiscount(makeDiscountCode())
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
  })

  it('handles numeric discount value', () => {
    const result = transformDiscount(makeDiscountCode({ discount: 25 }))
    expect(result.value).toBe(25)
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeDiscountCode()
    const result = transformDiscount(raw)
    expect(result.metadata).toBe(raw)
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformDiscount', () => {
    const canonical = transformDiscount(makeDiscountCode())
    const body = untransformDiscount(canonical)
    expect(body['code']).toBe('SAVE10')
    expect(body['type_id']).toBe(1)
    expect(body['discount']).toBe(10)
  })

  it('round-trips FIXED_AMOUNT back to major units', () => {
    const raw = makeDiscountCode({ type_id: 2, discount: null, discount_value: '300' })
    const canonical = transformDiscount(raw)
    const body = untransformDiscount({ ...canonical, currency: 'RUB' })
    // 30000 minor → 300 major
    expect(body['discount_value']).toBeCloseTo(300, 2)
  })
})
