import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawShopifyPriceRule,
  type RawShopifyDiscountCode,
} from '../../../../../../../src/verticals/ecommerce/adapters/shogun/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRule(overrides: Partial<RawShopifyPriceRule> = {}): RawShopifyPriceRule {
  return {
    id: 700,
    title: 'Save 10%',
    target_type: 'line_item',
    target_selection: 'all',
    allocation_method: 'across',
    value_type: 'percentage',
    value: '-10.0',
    customer_selection: 'all',
    prerequisite_subtotal_range: null,
    usage_limit: 100,
    entitled_product_ids: [],
    entitled_collection_ids: [],
    starts_at: '2026-01-01T00:00:00.000Z',
    ends_at: '2026-12-31T23:59:59.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeCode(overrides: Partial<RawShopifyDiscountCode> = {}): RawShopifyDiscountCode {
  return {
    id: 800,
    code: 'SAVE10',
    usage_count: 3,
    price_rule_id: 700,
    ...overrides,
  }
}

// ── transformDiscount ─────────────────────────────────────────────────────────

describe('transformDiscount (Shogun)', () => {
  it('maps id from price rule', () => {
    const result = transformDiscount(makeRule(), makeCode())
    expect(result.id).toBe('700')
  })

  it('maps code from discount code', () => {
    const result = transformDiscount(makeRule(), makeCode())
    expect(result.code).toBe('SAVE10')
  })

  it('maps title from price rule', () => {
    const result = transformDiscount(makeRule(), makeCode())
    expect(result.title).toBe('Save 10%')
  })

  it('maps percentage value type', () => {
    const result = transformDiscount(makeRule(), makeCode())
    expect(result.type).toBe('PERCENTAGE')
    // Shopify stores value as negative string "-10.0"; transform flips sign
    expect(result.value).toBe(10)
  })

  it('maps fixed_amount to FIXED_AMOUNT and converts to minor units', () => {
    const rule = makeRule({ value_type: 'fixed_amount', value: '-5.00' })
    const result = transformDiscount(rule)
    expect(result.type).toBe('FIXED_AMOUNT')
    // 5 USD → 500 cents
    expect(result.value).toBe(500)
  })

  it('maps shipping_line target to FREE_SHIPPING', () => {
    const rule = makeRule({ target_type: 'shipping_line', value_type: 'percentage', value: '-100.0' })
    const result = transformDiscount(rule)
    expect(result.type).toBe('FREE_SHIPPING')
  })

  it('maps target_selection all → ORDER appliesTo', () => {
    const result = transformDiscount(makeRule())
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps customer_selection all to ALL eligibility', () => {
    const result = transformDiscount(makeRule(), makeCode())
    expect(result.customerEligibility).toBe('ALL')
  })

  it('maps prerequisite_subtotal_range to minimumPurchaseAmount', () => {
    const rule = makeRule({ prerequisite_subtotal_range: { greater_than_or_equal_to: '50.00' } })
    const result = transformDiscount(rule)
    expect(result.minimumPurchaseAmount).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('maps usageLimit and usageCount', () => {
    const result = transformDiscount(makeRule(), makeCode())
    expect(result.usageLimit).toBe(100)
    expect(result.usageCount).toBe(3)
  })

  it('maps startsAt and endsAt', () => {
    const result = transformDiscount(makeRule(), makeCode())
    expect(result.startsAt).toBe('2026-01-01T00:00:00.000Z')
    expect(result.endsAt).toBe('2026-12-31T23:59:59.000Z')
  })

  it('produces a payload satisfying DiscountSchema', () => {
    const result = transformDiscount(makeRule(), makeCode())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })
})

// ── untransformDiscount ───────────────────────────────────────────────────────

describe('untransformDiscount (Shogun)', () => {
  it('maps title', () => {
    const body = untransformDiscount({ title: 'Save 10%', type: 'PERCENTAGE', value: 10 })
    expect(body['title']).toBe('Save 10%')
  })

  it('negates value for Shopify format', () => {
    const body = untransformDiscount({ type: 'PERCENTAGE', value: 10 })
    expect(body['value']).toBe('-10')
  })

  it('maps usageLimit', () => {
    const body = untransformDiscount({ usageLimit: 50 })
    expect(body['usage_limit']).toBe(50)
  })
})
