import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawShoplinePriceRule,
  type RawShoplineDiscountCode,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopline/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeRule(overrides: Partial<RawShoplinePriceRule> = {}): RawShoplinePriceRule {
  return {
    id: 4001,
    title: '10% Off Everything',
    target_type: 'line_item',
    target_selection: 'all',
    allocation_method: 'across',
    value_type: 'percentage',
    value: '-10.0',
    customer_selection: 'all',
    usage_limit: 100,
    starts_at: '2024-01-01T00:00:00.000Z',
    ends_at: '2024-12-31T23:59:59.000Z',
    created_at: '2024-01-01T00:00:00.000Z',
    currency: 'USD',
    ...overrides,
  }
}

const makeCode = (overrides: Partial<RawShoplineDiscountCode> = {}): RawShoplineDiscountCode => ({
  id: 5001,
  code: 'SAVE10',
  usage_count: 3,
  price_rule_id: 4001,
  ...overrides,
})

describe('transformDiscount', () => {
  it('maps id and title', () => {
    const result = transformDiscount(makeRule())
    expect(result.id).toBe('4001')
    expect(result.title).toBe('10% Off Everything')
  })

  it('attaches code from RawShoplineDiscountCode', () => {
    const result = transformDiscount(makeRule(), makeCode())
    expect(result.code).toBe('SAVE10')
    expect(result.usageCount).toBe(3)
  })

  it('maps percentage type', () => {
    const result = transformDiscount(makeRule())
    expect(result.type).toBe('PERCENTAGE')
    // Percentage value: abs(-10.0) = 10, no minor-unit conversion
    expect(result.value).toBe(10)
  })

  it('maps fixed_amount type and converts to minor units', () => {
    const result = transformDiscount(makeRule({ value_type: 'fixed_amount', value: '-5.00' }))
    expect(result.type).toBe('FIXED_AMOUNT')
    // 5.00 USD → 500 cents
    expect(result.value).toBe(500)
  })

  it('maps shipping_line target to FREE_SHIPPING type', () => {
    const result = transformDiscount(makeRule({ target_type: 'shipping_line' }))
    expect(result.type).toBe('FREE_SHIPPING')
  })

  it('maps appliesTo ORDER when target_selection is all', () => {
    const result = transformDiscount(makeRule())
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps appliesTo SHIPPING for shipping_line target', () => {
    const result = transformDiscount(makeRule({ target_type: 'shipping_line' }))
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps customer_selection to customerEligibility', () => {
    expect(transformDiscount(makeRule({ customer_selection: 'all' })).customerEligibility).toBe(
      'ALL',
    )
    expect(
      transformDiscount(makeRule({ customer_selection: 'prerequisite' })).customerEligibility,
    ).toBe('SPECIFIC')
  })

  it('maps minimumPurchaseAmount from prerequisite_subtotal_range', () => {
    const result = transformDiscount(
      makeRule({ prerequisite_subtotal_range: { greater_than_or_equal_to: '50.00' } }),
    )
    // 50.00 USD → 5000 cents
    expect(result.minimumPurchaseAmount).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('maps usageLimit and date range', () => {
    const result = transformDiscount(makeRule())
    expect(result.usageLimit).toBe(100)
    expect(result.startsAt).toBe('2024-01-01T00:00:00.000Z')
    expect(result.endsAt).toBe('2024-12-31T23:59:59.000Z')
  })

  it('metadata contains the rule and code objects', () => {
    const rule = makeRule()
    const code = makeCode()
    const result = transformDiscount(rule, code)
    expect((result.metadata as Record<string, unknown>).rule).toBe(rule)
    expect((result.metadata as Record<string, unknown>).code).toBe(code)
  })

  it('satisfies DiscountSchema', () => {
    const result = transformDiscount(makeRule(), makeCode())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformDiscount', () => {
    const canonical = transformDiscount(makeRule(), makeCode())
    const body = untransformDiscount(canonical)
    expect(body.title).toBe('10% Off Everything')
    expect(body.value_type).toBe('percentage')
    // Percentage discount: value should be negative
    expect(Number(body.value)).toBeLessThan(0)
    expect(body.customer_selection).toBe('all')
  })
})
