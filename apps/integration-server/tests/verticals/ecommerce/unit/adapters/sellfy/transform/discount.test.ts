import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawShopifyPriceRule,
  type RawShopifyDiscountCode,
} from '../../../../../../../src/verticals/ecommerce/adapters/sellfy/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makePriceRule(overrides: Partial<RawShopifyPriceRule> = {}): RawShopifyPriceRule {
  return {
    id: 301,
    title: '10% Off Everything',
    target_type: 'line_item',
    target_selection: 'all',
    allocation_method: 'across',
    value_type: 'percentage',
    value: '-10',
    customer_selection: 'all',
    usage_limit: 100,
    starts_at: '2024-01-01T00:00:00Z',
    ends_at: '2024-12-31T23:59:59Z',
    created_at: '2023-12-15T12:00:00Z',
    ...overrides,
  }
}

const discountCode: RawShopifyDiscountCode = {
  id: 401,
  code: 'SAVE10',
  usage_count: 5,
  price_rule_id: 301,
}

describe('transformDiscount — percentage', () => {
  it('maps id and code', () => {
    const result = transformDiscount(makePriceRule(), discountCode)
    expect(result.id).toBe('301')
    expect(result.code).toBe('SAVE10')
  })

  it('maps value_type percentage to PERCENTAGE type and keeps value as-is', () => {
    const result = transformDiscount(makePriceRule())
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
  })

  it('maps target_type line_item with target_selection all to appliesTo ORDER', () => {
    const result = transformDiscount(makePriceRule())
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps customer_selection all to customerEligibility ALL', () => {
    const result = transformDiscount(makePriceRule())
    expect(result.customerEligibility).toBe('ALL')
  })

  it('maps usageLimit and usageCount', () => {
    const result = transformDiscount(makePriceRule(), discountCode)
    expect(result.usageLimit).toBe(100)
    expect(result.usageCount).toBe(5)
  })

  it('maps startsAt and endsAt', () => {
    const result = transformDiscount(makePriceRule())
    expect(result.startsAt).toBe('2024-01-01T00:00:00Z')
    expect(result.endsAt).toBe('2024-12-31T23:59:59Z')
  })

  it('produces a payload that satisfies DiscountSchema (percentage)', () => {
    const result = transformDiscount(makePriceRule(), discountCode)
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })
})

describe('transformDiscount — fixed amount', () => {
  const fixedRule = makePriceRule({
    id: 302,
    title: '$5 Off',
    value_type: 'fixed_amount',
    value: '-5.00',
  })

  it('maps value_type fixed_amount to FIXED_AMOUNT and converts to minor units', () => {
    const result = transformDiscount(fixedRule)
    expect(result.type).toBe('FIXED_AMOUNT')
    // $5.00 → 500 cents (USD default, 2 decimal places)
    expect(result.value).toBe(500)
  })

  it('maps id and title', () => {
    const result = transformDiscount(fixedRule)
    expect(result.id).toBe('302')
    expect(result.title).toBe('$5 Off')
  })

  it('produces a payload that satisfies DiscountSchema (fixed amount)', () => {
    const result = transformDiscount(fixedRule)
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })
})

describe('transformDiscount — shipping', () => {
  const shippingRule = makePriceRule({
    id: 303,
    title: 'Free Shipping',
    target_type: 'shipping_line',
    target_selection: 'all',
    value_type: 'percentage',
    value: '-100',
  })

  it('maps target_type shipping_line to FREE_SHIPPING type', () => {
    const result = transformDiscount(shippingRule)
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps id correctly', () => {
    const result = transformDiscount(shippingRule)
    expect(result.id).toBe('303')
  })

  it('produces a payload that satisfies DiscountSchema (free shipping)', () => {
    const result = transformDiscount(shippingRule)
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })
})

describe('transformDiscount — minimumPurchaseAmount', () => {
  it('maps prerequisite_subtotal_range to minimumPurchaseAmount', () => {
    const rule = makePriceRule({
      prerequisite_subtotal_range: { greater_than_or_equal_to: '50.00' },
    })
    const result = transformDiscount(rule)
    expect(result.minimumPurchaseAmount).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('omits minimumPurchaseAmount when prerequisite_subtotal_range is null', () => {
    const rule = makePriceRule({ prerequisite_subtotal_range: null })
    const result = transformDiscount(rule)
    expect(result.minimumPurchaseAmount).toBeUndefined()
  })
})

describe('untransformDiscount', () => {
  it('round-trips type and value fields', () => {
    const canonical = transformDiscount(makePriceRule())
    const raw = untransformDiscount(canonical)
    expect(raw.value_type).toBe('percentage')
    expect(raw.target_type).toBe('line_item')
    expect(raw.target_selection).toBe('all')
  })

  it('maps title and usage_limit', () => {
    const canonical = transformDiscount(makePriceRule())
    const raw = untransformDiscount(canonical)
    expect(raw.title).toBe('10% Off Everything')
    expect(raw.usage_limit).toBe(100)
  })
})
