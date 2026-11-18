import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawShopifyPriceRule,
  type RawShopifyDiscountCode,
} from '../../../../../../../src/verticals/ecommerce/adapters/jimdo/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

describe('transformDiscount (jimdo)', () => {
  const rule: RawShopifyPriceRule = {
    id: 55,
    title: 'SUMMER10',
    target_type: 'line_item',
    target_selection: 'all',
    value_type: 'percentage',
    value: '-10.0',
    customer_selection: 'all',
    starts_at: '2024-03-01T00:00:00Z',
    ends_at: '2024-06-30T00:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
    usage_limit: 100,
  }

  const code: RawShopifyDiscountCode = {
    id: 77,
    code: 'SUMMER10',
    usage_count: 5,
    price_rule_id: 55,
  }

  it('maps id to string', () => {
    const result = transformDiscount(rule, code)
    expect(result.id).toBe('55')
  })

  it('maps code from the discount code object', () => {
    const result = transformDiscount(rule, code)
    expect(result.code).toBe('SUMMER10')
  })

  it('maps type PERCENTAGE and keeps value as absolute percentage', () => {
    const result = transformDiscount(rule, code)
    expect(result.type).toBe('PERCENTAGE')
    // -10.0 flipped to positive → 10
    expect(result.value).toBe(10)
  })

  it('maps appliesTo ORDER when target_selection is all', () => {
    const result = transformDiscount(rule, code)
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps customerEligibility ALL', () => {
    const result = transformDiscount(rule, code)
    expect(result.customerEligibility).toBe('ALL')
  })

  it('maps startsAt and endsAt', () => {
    const result = transformDiscount(rule, code)
    expect(result.startsAt).toBe('2024-03-01T00:00:00Z')
    expect(result.endsAt).toBe('2024-06-30T00:00:00Z')
  })

  it('maps usageCount from code', () => {
    const result = transformDiscount(rule, code)
    expect(result.usageCount).toBe(5)
  })

  it('produces schema-valid output', () => {
    const result = transformDiscount(rule, code)
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('maps FIXED_AMOUNT type and converts value to minor units', () => {
    const fixedRule: RawShopifyPriceRule = {
      ...rule,
      value_type: 'fixed_amount',
      target_selection: 'entitled',
      value: '-5.00',
    }
    const result = transformDiscount(fixedRule)
    expect(result.type).toBe('FIXED_AMOUNT')
    // 5.00 USD → 500 cents
    expect(result.value).toBe(500)
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('maps FREE_SHIPPING type when target_type is shipping_line', () => {
    const shippingRule: RawShopifyPriceRule = {
      ...rule,
      target_type: 'shipping_line',
    }
    const result = transformDiscount(shippingRule)
    expect(result.type).toBe('FREE_SHIPPING')
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformDiscount', () => {
    const result = transformDiscount(rule, code)
    const back = untransformDiscount(result)
    expect(back.title).toBe(rule.title)
    expect(back.value_type).toBe('percentage')
    expect(back.customer_selection).toBe('all')
  })
})
