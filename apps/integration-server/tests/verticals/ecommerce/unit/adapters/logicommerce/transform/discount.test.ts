import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawShopifyPriceRule,
  type RawShopifyDiscountCode,
} from '../../../../../../../src/verticals/ecommerce/adapters/logicommerce/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeRule(overrides: Partial<RawShopifyPriceRule> = {}): RawShopifyPriceRule {
  return {
    id: 500,
    title: '10% Off',
    target_type: 'line_item',
    target_selection: 'all',
    value_type: 'percentage',
    value: '-10.0',
    customer_selection: 'all',
    usage_limit: 50,
    starts_at: '2024-03-01T00:00:00Z',
    ends_at: '2024-12-31T23:59:59Z',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeCode(overrides: Partial<RawShopifyDiscountCode> = {}): RawShopifyDiscountCode {
  return { id: 600, code: 'SAVE10', usage_count: 2, ...overrides }
}

describe('transformDiscount (logicommerce / Shopify)', () => {
  it('maps rule.id to string id', () => {
    const result = transformDiscount(makeRule({ id: 99 }))
    expect(result.id).toBe('99')
  })

  it('maps discount code', () => {
    const result = transformDiscount(makeRule(), makeCode({ code: 'SAVE10' }))
    expect(result.code).toBe('SAVE10')
  })

  it('maps percentage type to PERCENTAGE', () => {
    const result = transformDiscount(makeRule({ value_type: 'percentage' }))
    expect(result.type).toBe('PERCENTAGE')
  })

  it('maps shipping_line target to FREE_SHIPPING type', () => {
    const result = transformDiscount(makeRule({ target_type: 'shipping_line' }))
    expect(result.type).toBe('FREE_SHIPPING')
  })

  it('flips negative percentage value to positive', () => {
    const result = transformDiscount(makeRule({ value: '-10.0', value_type: 'percentage' }))
    expect(result.value).toBe(10)
  })

  it('converts FIXED_AMOUNT to minor units', () => {
    // -5.00 USD → 500 cents
    const result = transformDiscount(
      makeRule({ value_type: 'fixed_amount', value: '-5.00', target_selection: 'entitled' }),
    )
    expect(result.value).toBe(500)
  })

  it('maps ORDER appliesTo for line_item + all', () => {
    const result = transformDiscount(
      makeRule({ target_type: 'line_item', target_selection: 'all' }),
    )
    expect(result.appliesTo).toBe('ORDER')
  })

  it('stores rule in metadata', () => {
    const rule = makeRule()
    const result = transformDiscount(rule)
    expect((result.metadata as Record<string, unknown>).rule).toBe(rule)
  })

  it('produces a payload satisfying DiscountSchema', () => {
    const result = transformDiscount(makeRule(), makeCode())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })
})

describe('untransformDiscount (logicommerce / Shopify)', () => {
  it('maps PERCENTAGE type to percentage value_type', () => {
    const body = untransformDiscount({ type: 'PERCENTAGE', value: 10 })
    expect(body.value_type).toBe('percentage')
  })

  it('round-trips discount title', () => {
    const canonical = transformDiscount(makeRule(), makeCode())
    const body = untransformDiscount(canonical)
    expect(body.title).toBe('10% Off')
  })
})
