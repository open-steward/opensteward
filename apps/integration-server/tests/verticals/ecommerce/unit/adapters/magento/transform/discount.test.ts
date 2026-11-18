import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawMagentoSalesRule,
  type RawMagentoCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/magento/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeRule(overrides: Partial<RawMagentoSalesRule> = {}): RawMagentoSalesRule {
  return {
    rule_id: 12,
    name: '10% Off Everything',
    description: 'Site-wide 10% off',
    website_ids: [1],
    customer_group_ids: [0, 1, 2],
    from_date: '2024-01-01T00:00:00.000Z',
    to_date: '2024-12-31T00:00:00.000Z',
    uses_per_customer: 1,
    is_active: true,
    stop_rules_processing: false,
    is_advanced: true,
    sort_order: 0,
    simple_action: 'by_percent',
    discount_amount: 10,
    apply_to_shipping: false,
    times_used: 0,
    is_rss: false,
    coupon_type: 'SPECIFIC_COUPON',
    use_auto_generation: false,
    uses_per_coupon: 0,
    simple_free_shipping: 0,
    ...overrides,
  }
}

function makeCoupon(overrides: Partial<RawMagentoCoupon> = {}): RawMagentoCoupon {
  return {
    coupon_id: 45,
    rule_id: 12,
    code: 'SAVE10',
    usage_limit: 100,
    usage_per_customer: 1,
    times_used: 5,
    expiration_date: '2024-12-31T00:00:00.000Z',
    is_primary: true,
    created_at: '2024-01-01T00:00:00.000Z',
    type: 0,
    ...overrides,
  }
}

describe('transformDiscount (Magento)', () => {
  it('maps core fields from a rule + coupon pair', () => {
    const result = transformDiscount(makeRule(), makeCoupon())
    expect(result.id).toBe('12')
    expect(typeof result.id).toBe('string')
    expect(result.code).toBe('SAVE10')
    expect(result.title).toBe('10% Off Everything')
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
    expect(result.usageLimit).toBe(100)
    expect(result.usageCount).toBe(5)
  })

  it('maps FIXED_AMOUNT, BUY_X_GET_Y, and FREE_SHIPPING variants', () => {
    expect(
      transformDiscount(
        makeRule({ simple_action: 'cart_fixed', discount_amount: 5 }),
      ).type,
    ).toBe('FIXED_AMOUNT')
    expect(
      transformDiscount(makeRule({ simple_action: 'buy_x_get_y' })).type,
    ).toBe('BUY_X_GET_Y')
    expect(
      transformDiscount(makeRule({ simple_free_shipping: 1 })).type,
    ).toBe('FREE_SHIPPING')
  })

  it('derives appliesTo from the Magento action', () => {
    expect(
      transformDiscount(makeRule({ simple_action: 'cart_fixed' })).appliesTo,
    ).toBe('ORDER')
    expect(
      transformDiscount(makeRule({ simple_action: 'by_percent' })).appliesTo,
    ).toBe('PRODUCTS')
    expect(
      transformDiscount(makeRule({ simple_free_shipping: 1 })).appliesTo,
    ).toBe('SHIPPING')
  })

  it('preserves raw rule in metadata (plus the coupon under metadata.coupon)', () => {
    const rule = makeRule()
    const coupon = makeCoupon()
    const result = transformDiscount(rule, coupon)
    const meta = result.metadata as Record<string, unknown>
    expect(meta['rule_id']).toBe(12)
    expect(meta['coupon']).toBe(coupon)
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    const result = transformDiscount(makeRule(), makeCoupon())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformDiscount', () => {
    const canonical = transformDiscount(makeRule(), makeCoupon())
    const { rule, coupon } = untransformDiscount(canonical)
    expect(rule['name']).toBe('10% Off Everything')
    expect(rule['simple_action']).toBe('by_percent')
    expect(rule['discount_amount']).toBe(10)
    expect(coupon).toBeDefined()
    expect(coupon!['code']).toBe('SAVE10')
  })

  it('omits the coupon object when the canonical discount has no code', () => {
    const canonical = transformDiscount(makeRule(), undefined)
    const { coupon } = untransformDiscount(canonical)
    expect(coupon).toBeUndefined()
  })
})
