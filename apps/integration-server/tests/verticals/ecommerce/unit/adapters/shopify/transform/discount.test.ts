import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  type RawShopifyPriceRule,
  type RawShopifyDiscountCode,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopify/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeRule(overrides: Partial<RawShopifyPriceRule> = {}): RawShopifyPriceRule {
  return {
    id: 3001,
    title: '10% Off Everything',
    target_type: 'line_item',
    target_selection: 'all',
    allocation_method: 'across',
    value_type: 'percentage',
    value: '-10.0',
    customer_selection: 'all',
    prerequisite_subtotal_range: { greater_than_or_equal_to: '50.00' },
    usage_limit: 100,
    entitled_product_ids: [],
    entitled_collection_ids: [],
    starts_at: '2024-01-01T00:00:00Z',
    ends_at: '2024-12-31T23:59:59Z',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeCode(overrides: Partial<RawShopifyDiscountCode> = {}): RawShopifyDiscountCode {
  return {
    id: 4001,
    price_rule_id: 3001,
    code: 'SAVE10',
    usage_count: 25,
    ...overrides,
  }
}

describe('transformDiscount', () => {
  it('maps core fields and flips the negative value', () => {
    const result = transformDiscount(makeRule(), makeCode())
    expect(result.id).toBe('3001')
    expect(typeof result.id).toBe('string')
    expect(result.code).toBe('SAVE10')
    expect(result.title).toBe('10% Off Everything')
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
    expect(result.appliesTo).toBe('ORDER')
    expect(result.usageLimit).toBe(100)
    expect(result.usageCount).toBe(25)
    expect(result.customerEligibility).toBe('ALL')
  })

  it('maps the prerequisite subtotal as a minimum purchase amount', () => {
    const result = transformDiscount(makeRule(), makeCode())
    expect(result.minimumPurchaseAmount).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('detects FREE_SHIPPING when target_type is shipping_line', () => {
    const result = transformDiscount(
      makeRule({ target_type: 'shipping_line', value_type: 'percentage', value: '-100.0' }),
    )
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('detects FIXED_AMOUNT discounts', () => {
    const result = transformDiscount(
      makeRule({ value_type: 'fixed_amount', value: '-15.0' }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(1500)
  })

  it('preserves raw payload in metadata', () => {
    const rule = makeRule()
    const code = makeCode()
    const result = transformDiscount(rule, code)
    expect((result.metadata as { rule: unknown }).rule).toBe(rule)
    expect((result.metadata as { code: unknown }).code).toBe(code)
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    const result = transformDiscount(makeRule(), makeCode())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })
})
