import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawSapoPriceRule,
  type RawSapoDiscountCode,
} from '../../../../../../../src/verticals/ecommerce/adapters/sapo/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeRule(overrides: Partial<RawSapoPriceRule> = {}): RawSapoPriceRule {
  return {
    id: 3001,
    title: 'Giảm 10%',
    target_type: 'line_item',
    target_selection: 'all',
    value_type: 'percentage',
    value: '-10.0',
    customer_selection: 'all',
    starts_at: '2024-01-01T00:00:00Z',
    ends_at: '2024-12-31T23:59:59Z',
    created_on: '2023-12-15T10:00:00Z',
    ...overrides,
  }
}

function makeCode(overrides: Partial<RawSapoDiscountCode> = {}): RawSapoDiscountCode {
  return {
    id: 8001,
    code: 'GIAM10',
    usage_count: 5,
    price_rule_id: 3001,
    ...overrides,
  }
}

describe('transformDiscount (Sapo)', () => {
  it('stringifies numeric id', () => {
    const result = transformDiscount(makeRule())
    expect(result.id).toBe('3001')
    expect(typeof result.id).toBe('string')
  })

  it('maps percentage type and flips negative value to positive', () => {
    // value = "-10.0" → type = PERCENTAGE → Math.abs(-10) = 10
    const result = transformDiscount(makeRule())
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
  })

  it('maps line_item + all → ORDER appliesTo', () => {
    const result = transformDiscount(makeRule())
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps fixed_amount type and converts VND to minor units (no scaling)', () => {
    // VND has 0 exponent: majorToMinor(50000, 'VND') === 50000
    const rule = makeRule({ value_type: 'fixed_amount', value: '-50000' })
    const result = transformDiscount(rule)
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(50000)
  })

  it('maps shipping_line type to FREE_SHIPPING', () => {
    const rule = makeRule({ target_type: 'shipping_line' })
    const result = transformDiscount(rule)
    expect(result.type).toBe('FREE_SHIPPING')
  })

  it('merges code fields when provided', () => {
    const result = transformDiscount(makeRule(), makeCode())
    expect(result.code).toBe('GIAM10')
    expect(result.usageCount).toBe(5)
  })

  it('maps customer_selection all → ALL eligibility', () => {
    const result = transformDiscount(makeRule())
    expect(result.customerEligibility).toBe('ALL')
  })

  it('maps starts_at/ends_at and created_on', () => {
    const result = transformDiscount(makeRule())
    expect(result.startsAt).toBe('2024-01-01T00:00:00Z')
    expect(result.endsAt).toBe('2024-12-31T23:59:59Z')
    expect(result.createdAt).toBe('2023-12-15T10:00:00Z')
  })

  it('converts prerequisite_subtotal_range to minimumPurchaseAmount in VND', () => {
    const rule = makeRule({
      prerequisite_subtotal_range: { greater_than_or_equal_to: '100000' },
    })
    const result = transformDiscount(rule)
    // VND: majorToMinor(100000, 'VND') === 100000
    expect(result.minimumPurchaseAmount).toEqual({ amount: 100000, currency: 'VND' })
  })

  it('metadata contains the rule reference', () => {
    const rule = makeRule()
    const code = makeCode()
    const result = transformDiscount(rule, code)
    expect((result.metadata as { rule: unknown }).rule).toBe(rule)
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    const result = transformDiscount(makeRule(), makeCode())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformDiscount', () => {
    const canonical = transformDiscount(makeRule(), makeCode())
    const raw = untransformDiscount(canonical)
    expect(raw.title).toBe('Giảm 10%')
    expect(raw.value_type).toBe('percentage')
    // Sapo expects negative value
    expect(Number(raw.value)).toBeLessThan(0)
  })
})
