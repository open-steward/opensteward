import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawShopifyPriceRule,
  type RawShopifyDiscountCode,
} from '../../../../../../../src/verticals/ecommerce/adapters/bold-commerce/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

describe('transformDiscount (bold-commerce)', () => {
  const rule: RawShopifyPriceRule = {
    id: 999,
    title: 'Summer10',
    target_type: 'line_item',
    target_selection: 'all',
    value_type: 'percentage',
    value: '-10.0',
    customer_selection: 'all',
    usage_limit: 100,
    starts_at: '2024-03-01T00:00:00Z',
    ends_at: '2024-06-01T00:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
  }

  const code: RawShopifyDiscountCode = {
    id: 77,
    code: 'SUMMER10',
    usage_count: 5,
    price_rule_id: 999,
  }

  it('maps id to string', () => {
    expect(transformDiscount(rule, code).id).toBe('999')
  })

  it('maps code from discount code object', () => {
    expect(transformDiscount(rule, code).code).toBe('SUMMER10')
  })

  it('maps type to PERCENTAGE for value_type=percentage', () => {
    expect(transformDiscount(rule, code).type).toBe('PERCENTAGE')
  })

  it('maps appliesTo to ORDER when target_selection=all', () => {
    expect(transformDiscount(rule, code).appliesTo).toBe('ORDER')
  })

  it('flips negative value to positive for percentage', () => {
    // value is '-10.0' → Math.abs → 10
    expect(transformDiscount(rule, code).value).toBe(10)
  })

  it('converts FIXED_AMOUNT value to minor units', () => {
    const fixedRule: RawShopifyPriceRule = {
      ...rule,
      value_type: 'fixed_amount',
      value: '-5.00',
    }
    const result = transformDiscount(fixedRule, code)
    expect(result.type).toBe('FIXED_AMOUNT')
    // 5 USD → 500 cents
    expect(result.value).toBe(500)
  })

  it('maps usageCount from code', () => {
    expect(transformDiscount(rule, code).usageCount).toBe(5)
  })

  it('maps customerEligibility to ALL', () => {
    expect(transformDiscount(rule, code).customerEligibility).toBe('ALL')
  })

  it('passes DiscountSchema validation for percentage', () => {
    const result = transformDiscount(rule, code)
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('passes DiscountSchema validation for FREE_SHIPPING', () => {
    const shippingRule: RawShopifyPriceRule = {
      ...rule,
      target_type: 'shipping_line',
      value_type: 'percentage',
      value: '-100.0',
    }
    const result = transformDiscount(shippingRule)
    expect(result.type).toBe('FREE_SHIPPING')
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('handles minimum purchase amount', () => {
    const ruleWithMin: RawShopifyPriceRule = {
      ...rule,
      prerequisite_subtotal_range: { greater_than_or_equal_to: '50.00' },
    }
    const result = transformDiscount(ruleWithMin, code)
    // 50 USD → 5000 cents
    expect(result.minimumPurchaseAmount?.amount).toBe(5000)
    expect(result.minimumPurchaseAmount?.currency).toBe('USD')
  })
})

describe('untransformDiscount (bold-commerce)', () => {
  it('round-trips title and type', () => {
    const rule: RawShopifyPriceRule = {
      id: 1,
      title: 'TestDisc',
      value_type: 'percentage',
      value: '-20.0',
      target_type: 'line_item',
      target_selection: 'all',
      customer_selection: 'all',
    }
    const canonical = transformDiscount(rule)
    const body = untransformDiscount(canonical)
    expect(body.title).toBe('TestDisc')
    expect(body.value_type).toBe('percentage')
  })

  it('negates value back for Shopify', () => {
    const rule: RawShopifyPriceRule = {
      id: 2,
      value_type: 'percentage',
      value: '-15.0',
      target_type: 'line_item',
      target_selection: 'all',
    }
    const canonical = transformDiscount(rule)
    const body = untransformDiscount(canonical)
    // Shopify expects negative values
    expect(Number(body.value)).toBeLessThan(0)
  })
})
