import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawNopDiscount,
} from '../../../../../../../src/verticals/ecommerce/adapters/nopcommerce/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeDiscount(overrides: Partial<RawNopDiscount> = {}): RawNopDiscount {
  return {
    id: 300,
    name: 'Summer Sale',
    discount_type_id: 1,
    use_percentage: true,
    discount_percentage: 15,
    discount_amount: 0,
    coupon_code: 'SUMMER15',
    start_date_utc: '2024-06-01T00:00:00Z',
    end_date_utc: '2024-08-31T23:59:59Z',
    limitation_times: 100,
    ...overrides,
  }
}

describe('transformDiscount (nopCommerce)', () => {
  it('maps percentage discount', () => {
    const result = transformDiscount(makeDiscount())
    expect(result.id).toBe('300')
    expect(result.title).toBe('Summer Sale')
    expect(result.code).toBe('SUMMER15')
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(15)
    expect(result.appliesTo).toBe('ORDER')
    expect(result.startsAt).toBe('2024-06-01T00:00:00Z')
    expect(result.endsAt).toBe('2024-08-31T23:59:59Z')
    expect(result.usageLimit).toBe(100)
  })

  it('maps fixed amount discount', () => {
    const result = transformDiscount(
      makeDiscount({ use_percentage: false, discount_amount: 10, discount_percentage: 0 }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(10)
  })

  it('maps free shipping discount', () => {
    const result = transformDiscount(
      makeDiscount({ discount_type_id: 10, use_percentage: false, discount_amount: 0 }),
    )
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps product-level discount', () => {
    const result = transformDiscount(
      makeDiscount({ discount_type_id: 2, use_percentage: false, discount_amount: 5 }),
    )
    expect(result.appliesTo).toBe('PRODUCTS')
    expect(result.type).toBe('FIXED_AMOUNT')
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
    const body = untransformDiscount(canonical)
    expect(body['name']).toBe('Summer Sale')
    expect(body['coupon_code']).toBe('SUMMER15')
    expect(body['use_percentage']).toBe(true)
    expect(body['discount_percentage']).toBe(15)
    expect(body['start_date_utc']).toBe('2024-06-01T00:00:00Z')
  })
})
