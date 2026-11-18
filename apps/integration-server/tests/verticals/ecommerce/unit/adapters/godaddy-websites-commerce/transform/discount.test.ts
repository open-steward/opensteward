import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawShopifyPriceRule,
  type RawShopifyDiscountCode,
} from '../../../../../../../src/verticals/ecommerce/adapters/godaddy-websites-commerce/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeRule(overrides: Partial<RawShopifyPriceRule> = {}): RawShopifyPriceRule {
  return {
    id: 500,
    title: 'WELCOME10',
    target_type: 'line_item',
    target_selection: 'all',
    value_type: 'percentage',
    value: '-10.0',
    customer_selection: 'all',
    usage_limit: 1000,
    starts_at: '2024-03-01T00:00:00Z',
    ends_at: '2024-12-31T00:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

function makeCode(overrides: Partial<RawShopifyDiscountCode> = {}): RawShopifyDiscountCode {
  return {
    id: 501,
    code: 'WELCOME10',
    usage_count: 12,
    ...overrides,
  }
}

describe('transformDiscount (GoDaddy Websites + Commerce / Shopify shapes)', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformDiscount(makeRule(), makeCode())
    expect(result.id).toBe('500')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('WELCOME10')
    expect(result.code).toBe('WELCOME10')
    expect(result.usageCount).toBe(12)
  })

  it('maps PERCENTAGE type and flips negative value', () => {
    const result = transformDiscount(makeRule())
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
  })

  it('maps FIXED_AMOUNT type and converts major to minor units', () => {
    const result = transformDiscount(makeRule({ value_type: 'fixed_amount', value: '-5.00' }))
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(500)
  })

  it('maps FREE_SHIPPING when target_type is shipping_line', () => {
    const result = transformDiscount(
      makeRule({ target_type: 'shipping_line', value_type: undefined, value: '0' }),
    )
    expect(result.type).toBe('FREE_SHIPPING')
  })

  it('maps appliesTo ORDER for line_item + all selection', () => {
    const result = transformDiscount(makeRule())
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps minimumPurchaseAmount from prerequisite_subtotal_range', () => {
    const result = transformDiscount(
      makeRule({ prerequisite_subtotal_range: { greater_than_or_equal_to: '50.00' } }),
    )
    expect(result.minimumPurchaseAmount).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('stores rule + code in metadata', () => {
    const rule = makeRule()
    const code = makeCode()
    const result = transformDiscount(rule, code)
    const meta = result.metadata as { rule: unknown; code: unknown }
    expect(meta.rule).toBe(rule)
    expect(meta.code).toBe(code)
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    const result = transformDiscount(makeRule(), makeCode())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformDiscount', () => {
    const canonical = transformDiscount(makeRule(), makeCode())
    const back = untransformDiscount(canonical)
    expect(back.title).toBe('WELCOME10')
    expect(back.value_type).toBe('percentage')
  })
})
