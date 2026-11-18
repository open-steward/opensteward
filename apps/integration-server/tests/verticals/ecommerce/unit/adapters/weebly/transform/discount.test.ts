import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawShopifyPriceRule,
  type RawShopifyDiscountCode,
} from '../../../../../../../src/verticals/ecommerce/adapters/weebly/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makePriceRule(overrides: Partial<RawShopifyPriceRule> = {}): RawShopifyPriceRule {
  return {
    id: 55,
    title: '10% Off',
    value_type: 'percentage',
    value: '-10.0',
    target_type: 'line_item',
    target_selection: 'all',
    customer_selection: 'all',
    starts_at: '2024-01-01T00:00:00.000Z',
    created_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeDiscountCode(overrides: Partial<RawShopifyDiscountCode> = {}): RawShopifyDiscountCode {
  return {
    id: 99,
    code: 'OFF10',
    usage_count: 5,
    price_rule_id: 55,
    ...overrides,
  }
}

describe('transformDiscount', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformDiscount(makePriceRule(), makeDiscountCode())
    expect(result.id).toBe('55')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('10% Off')
    expect(result.code).toBe('OFF10')
    expect(result.usageCount).toBe(5)
  })

  it('converts Shopify negative value to positive absolute for PERCENTAGE', () => {
    const result = transformDiscount(makePriceRule())
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
  })

  it('converts target_type=shipping_line to FREE_SHIPPING type', () => {
    const result = transformDiscount(makePriceRule({ target_type: 'shipping_line' }))
    expect(result.type).toBe('FREE_SHIPPING')
  })

  it('converts FIXED_AMOUNT value to minor units', () => {
    const result = transformDiscount(
      makePriceRule({ value_type: 'fixed_amount', value: '-5.00' }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(500)
  })

  it('maps target_selection=all on line_item to appliesTo ORDER', () => {
    const result = transformDiscount(
      makePriceRule({ target_type: 'line_item', target_selection: 'all' }),
    )
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps shipping_line to appliesTo SHIPPING', () => {
    const result = transformDiscount(
      makePriceRule({ target_type: 'shipping_line' }),
    )
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps customer_selection=all to customerEligibility ALL', () => {
    const result = transformDiscount(makePriceRule({ customer_selection: 'all' }))
    expect(result.customerEligibility).toBe('ALL')
  })

  it('maps customer_selection=prerequisite to customerEligibility SPECIFIC', () => {
    const result = transformDiscount(makePriceRule({ customer_selection: 'prerequisite' }))
    expect(result.customerEligibility).toBe('SPECIFIC')
  })

  it('maps prerequisite_subtotal_range to minimumPurchaseAmount', () => {
    const result = transformDiscount(
      makePriceRule({
        prerequisite_subtotal_range: { greater_than_or_equal_to: '50.00' },
      }),
    )
    expect(result.minimumPurchaseAmount).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('preserves startsAt and endsAt', () => {
    const result = transformDiscount(
      makePriceRule({ ends_at: '2024-12-31T23:59:59.000Z' }),
    )
    expect(result.startsAt).toBe('2024-01-01T00:00:00.000Z')
    expect(result.endsAt).toBe('2024-12-31T23:59:59.000Z')
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    const result = transformDiscount(makePriceRule(), makeDiscountCode())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformDiscount', () => {
    const canonical = transformDiscount(makePriceRule(), makeDiscountCode())
    const raw = untransformDiscount(canonical)
    expect(raw.title).toBe('10% Off')
    expect(raw.value_type).toBe('percentage')
    // Shopify expects negative values on the way back
    expect(Number(raw.value)).toBeLessThan(0)
    expect(raw.target_type).toBe('line_item')
  })
})
