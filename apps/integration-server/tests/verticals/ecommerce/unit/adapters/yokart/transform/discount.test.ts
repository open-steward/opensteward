import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawYokartPromoCode,
} from '../../../../../../../src/verticals/ecommerce/adapters/yokart/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makePromoCode(overrides: Partial<RawYokartPromoCode> = {}): RawYokartPromoCode {
  return {
    promocode_id: 10,
    promocode_code: 'SAVE10',
    promocode_name: 'Save 10%',
    promocode_type: '1',
    promocode_value: '10',
    promocode_currency: 'USD',
    promocode_min_order_amount: '50.00',
    promocode_usage_count: 3,
    promocode_total_usage: 100,
    promocode_start_date: '2024-01-01T00:00:00Z',
    promocode_expiry_date: '2024-12-31T23:59:59Z',
    promocode_date_added: '2023-12-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformDiscount', () => {
  it('maps core fields', () => {
    const result = transformDiscount(makePromoCode())
    expect(result.id).toBe('10')
    expect(result.code).toBe('SAVE10')
    expect(result.title).toBe('Save 10%')
  })

  it('maps type "1" to PERCENTAGE', () => {
    const result = transformDiscount(makePromoCode({ promocode_type: '1' }))
    expect(result.type).toBe('PERCENTAGE')
    expect(result.appliesTo).toBe('ORDER')
    expect(result.value).toBe(10) // percentage stays as-is
  })

  it('maps type "2" to FIXED_AMOUNT and converts to minor units', () => {
    const result = transformDiscount(
      makePromoCode({ promocode_type: '2', promocode_value: '25.00', promocode_currency: 'USD' }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.appliesTo).toBe('ORDER')
    expect(result.value).toBe(2500) // $25.00 → 2500 cents
    expect(result.currency).toBe('USD')
  })

  it('maps type "3" to FREE_SHIPPING with SHIPPING appliesTo', () => {
    const result = transformDiscount(makePromoCode({ promocode_type: '3' }))
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps minimum purchase amount to minor units', () => {
    const result = transformDiscount(makePromoCode())
    // $50.00 → 5000 cents
    expect(result.minimumPurchaseAmount).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('does not set minimumPurchaseAmount when value is 0', () => {
    const result = transformDiscount(makePromoCode({ promocode_min_order_amount: '0' }))
    expect(result.minimumPurchaseAmount).toBeUndefined()
  })

  it('maps usageCount and usageLimit as integers', () => {
    const result = transformDiscount(makePromoCode())
    expect(result.usageCount).toBe(3)
    expect(result.usageLimit).toBe(100)
  })

  it('maps startsAt and endsAt', () => {
    const result = transformDiscount(makePromoCode())
    expect(result.startsAt).toBeTruthy()
    expect(result.endsAt).toBeTruthy()
  })

  it('falls back to promocode_code as title when promocode_name absent', () => {
    const result = transformDiscount(makePromoCode({ promocode_name: undefined }))
    expect(result.title).toBe('SAVE10')
  })

  it('does not set currency for PERCENTAGE type', () => {
    const result = transformDiscount(makePromoCode({ promocode_type: '1' }))
    expect(result.currency).toBeUndefined()
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    const result = transformDiscount(makePromoCode())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('round-trips to untransformDiscount', () => {
    const canonical = transformDiscount(makePromoCode())
    const raw = untransformDiscount(canonical)
    expect(raw['promocode_code']).toBe('SAVE10')
    expect(raw['promocode_type']).toBe('1')
  })

  it('untransformDiscount converts FIXED_AMOUNT back to major units', () => {
    const fixedPromo = makePromoCode({
      promocode_type: '2',
      promocode_value: '25.00',
      promocode_currency: 'USD',
    })
    const canonical = transformDiscount(fixedPromo)
    const raw = untransformDiscount(canonical)
    // 2500 minor → '25' major
    expect(parseFloat(raw['promocode_value'] as string)).toBe(25)
  })

  it('untransformDiscount maps FREE_SHIPPING type back to code "3"', () => {
    const canonical = transformDiscount(makePromoCode({ promocode_type: '3' }))
    const raw = untransformDiscount(canonical)
    expect(raw['promocode_type']).toBe('3')
  })
})
