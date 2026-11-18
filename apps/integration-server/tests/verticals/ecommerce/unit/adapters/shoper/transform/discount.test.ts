import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawShoperPromotionCode,
} from '../../../../../../../src/verticals/ecommerce/adapters/shoper/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeRaw(overrides: Partial<RawShoperPromotionCode> = {}): RawShoperPromotionCode {
  return {
    promotion_id: 501,
    code: 'ZIMA20',
    value: '20',
    value_type: 'percent',
    min_value: '50',
    currency: 'PLN',
    usage_limit: 100,
    usage_count: 12,
    active: 1,
    date_from: '2024-12-01T00:00:00.000Z',
    date_to: '2025-01-31T23:59:59.000Z',
    add_date: '2024-11-25T00:00:00.000Z',
    ...overrides,
  }
}

describe('shoper transformDiscount', () => {
  it('maps promotion_id to string id and code', () => {
    const result = transformDiscount(makeRaw())
    expect(result.id).toBe('501')
    expect(result.code).toBe('ZIMA20')
  })

  it('maps percent value_type to PERCENTAGE type', () => {
    const result = transformDiscount(makeRaw())
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(20)
  })

  it('maps amount value_type to FIXED_AMOUNT and converts to minor units', () => {
    // 30 PLN = 3000 gr (Polish grosz — PLN has 2 decimal places)
    const result = transformDiscount(
      makeRaw({ value_type: 'amount', value: '30', currency: 'PLN' }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(3000)
  })

  it('maps appliesTo as ORDER (always for Shoper)', () => {
    const result = transformDiscount(makeRaw())
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps minimumPurchaseAmount from min_value in minor units', () => {
    // 50 PLN = 5000 gr
    const result = transformDiscount(makeRaw())
    expect(result.minimumPurchaseAmount?.amount).toBe(5000)
    expect(result.minimumPurchaseAmount?.currency).toBe('PLN')
  })

  it('maps usage stats and date range', () => {
    const result = transformDiscount(makeRaw())
    expect(result.usageLimit).toBe(100)
    expect(result.usageCount).toBe(12)
    expect(result.startsAt).toBe('2024-12-01T00:00:00.000Z')
    expect(result.endsAt).toBe('2025-01-31T23:59:59.000Z')
  })

  it('produces output that passes DiscountSchema', () => {
    const result = transformDiscount(makeRaw())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformDiscount', () => {
    const canonical = transformDiscount(makeRaw())
    const back = untransformDiscount(canonical)
    expect(back.value_type).toBe('percent')
    expect(back.code).toBe('ZIMA20')
  })
})
