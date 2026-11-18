import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawShopifyPriceRule,
  type RawShopifyDiscountCode,
} from '../../../../../../../src/verticals/ecommerce/adapters/loja-integrada/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeRule(overrides: Partial<RawShopifyPriceRule> = {}): RawShopifyPriceRule {
  return {
    id: 501,
    title: '10% Off Roupas',
    target_type: 'line_item',
    target_selection: 'all',
    allocation_method: 'across',
    value_type: 'percentage',
    value: '-10.0',
    customer_selection: 'all',
    usage_limit: 100,
    entitled_product_ids: [],
    entitled_collection_ids: [],
    starts_at: '2024-01-01T00:00:00Z',
    ends_at: '2024-12-31T23:59:59Z',
    created_at: '2023-12-01T08:00:00Z',
    ...overrides,
  }
}

const makeCode = (overrides: Partial<RawShopifyDiscountCode> = {}): RawShopifyDiscountCode => ({
  id: 601,
  code: 'ROUPAS10',
  usage_count: 3,
  price_rule_id: 501,
  ...overrides,
})

describe('transformDiscount (loja-integrada / Shopify)', () => {
  it('maps id and code from attached DiscountCode', () => {
    const result = transformDiscount(makeRule(), makeCode())
    expect(result.id).toBe('501')
    expect(result.code).toBe('ROUPAS10')
  })

  it('maps title and usageCount', () => {
    const result = transformDiscount(makeRule(), makeCode())
    expect(result.title).toBe('10% Off Roupas')
    expect(result.usageCount).toBe(3)
    expect(result.usageLimit).toBe(100)
  })

  it('maps percentage type with absolute (positive) value', () => {
    const result = transformDiscount(makeRule())
    expect(result.type).toBe('PERCENTAGE')
    // Shopify stores "-10.0" → we abs() it
    expect(result.value).toBe(10)
  })

  it('maps fixed_amount type converting to minor units (USD)', () => {
    const rule = makeRule({ value_type: 'fixed_amount', value: '-20.00' })
    const result = transformDiscount(rule)
    expect(result.type).toBe('FIXED_AMOUNT')
    // 20.00 USD → 2000 cents
    expect(result.value).toBe(2000)
  })

  it('maps free_shipping type when target_type is shipping_line', () => {
    const rule = makeRule({ target_type: 'shipping_line', value_type: undefined })
    const result = transformDiscount(rule)
    expect(result.type).toBe('FREE_SHIPPING')
    // appliesTo maps shipping_line → SHIPPING
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps appliesTo ORDER when target_type=line_item and target_selection=all', () => {
    const result = transformDiscount(makeRule())
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps appliesTo PRODUCTS when target_type=line_item and target_selection=entitled', () => {
    const rule = makeRule({ target_selection: 'entitled', entitled_product_ids: [1001, 1002] })
    const result = transformDiscount(rule)
    expect(result.appliesTo).toBe('PRODUCTS')
    expect(result.productIds).toEqual(['1001', '1002'])
  })

  it('maps customerEligibility from customer_selection', () => {
    expect(transformDiscount(makeRule({ customer_selection: 'all' })).customerEligibility).toBe(
      'ALL',
    )
    expect(
      transformDiscount(makeRule({ customer_selection: 'prerequisite' })).customerEligibility,
    ).toBe('SPECIFIC')
  })

  it('maps minimumPurchaseAmount from prerequisite_subtotal_range', () => {
    const rule = makeRule({
      prerequisite_subtotal_range: { greater_than_or_equal_to: '50.00' },
    })
    const result = transformDiscount(rule)
    // 50.00 USD → 5000 cents
    expect(result.minimumPurchaseAmount).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('maps startsAt, endsAt, and createdAt', () => {
    const result = transformDiscount(makeRule())
    expect(result.startsAt).toBe('2024-01-01T00:00:00Z')
    expect(result.endsAt).toBe('2024-12-31T23:59:59Z')
    expect(result.createdAt).toBe('2023-12-01T08:00:00Z')
  })

  it('omits code when no DiscountCode is provided', () => {
    const result = transformDiscount(makeRule())
    expect(result.code).toBeUndefined()
    expect(result.usageCount).toBeUndefined()
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    const result = transformDiscount(makeRule(), makeCode())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })
})

describe('untransformDiscount (loja-integrada / Shopify)', () => {
  it('maps percentage discount back to Shopify body with negative value', () => {
    const result = untransformDiscount({
      title: '10% Off',
      type: 'PERCENTAGE',
      value: 10,
      appliesTo: 'ORDER',
      customerEligibility: 'ALL',
      startsAt: '2024-01-01T00:00:00Z',
    })
    expect(result.title).toBe('10% Off')
    expect(result.value_type).toBe('percentage')
    // value must be negative for Shopify
    expect(result.value).toBe('-10')
    expect(result.target_type).toBe('line_item')
    expect(result.target_selection).toBe('all')
    expect(result.customer_selection).toBe('all')
  })
})
