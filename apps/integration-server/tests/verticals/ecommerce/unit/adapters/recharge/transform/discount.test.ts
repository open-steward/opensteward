import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawRechargeDiscount,
} from '../../../../../../../src/verticals/ecommerce/adapters/recharge/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeDiscount(overrides: Partial<RawRechargeDiscount> = {}): RawRechargeDiscount {
  return {
    id: 301,
    code: 'SAVE10',
    value: 10,
    value_type: 'percentage',
    status: 'enabled',
    usage_limit: 100,
    usage_count: 5,
    starts_at: '2024-01-01T00:00:00Z',
    ends_at: '2024-12-31T23:59:59Z',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformDiscount', () => {
  it('maps id, code, and title', () => {
    const result = transformDiscount(makeDiscount())
    expect(result.id).toBe('301')
    expect(result.code).toBe('SAVE10')
    expect(result.title).toBe('SAVE10')
  })

  it('maps percentage type and preserves value as-is', () => {
    const result = transformDiscount(makeDiscount())
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
  })

  it('maps fixed_amount type and converts value to minor units', () => {
    const result = transformDiscount(makeDiscount({ value_type: 'fixed_amount', value: 15 }))
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(1500)
  })

  it('maps usage limits and count', () => {
    const result = transformDiscount(makeDiscount())
    expect(result.usageLimit).toBe(100)
    expect(result.usageCount).toBe(5)
  })

  it('maps minimum purchase amount to minor units', () => {
    const result = transformDiscount(makeDiscount({ minimum_order_amount: '20.00' }))
    expect(result.minimumPurchaseAmount).toEqual({ amount: 2000, currency: 'USD' })
  })

  it('omits minimumPurchaseAmount when zero', () => {
    const result = transformDiscount(makeDiscount({ minimum_order_amount: '0' }))
    expect(result.minimumPurchaseAmount).toBeUndefined()
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

  it('round-trips via untransformDiscount', () => {
    const canonical = transformDiscount(makeDiscount())
    const raw = untransformDiscount(canonical)
    expect(raw.code).toBe('SAVE10')
    expect(raw.value_type).toBe('percentage')
    expect(raw.value).toBe(10)
  })
})
