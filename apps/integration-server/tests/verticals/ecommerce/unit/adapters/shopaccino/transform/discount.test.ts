import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawShopifyPriceRule,
  type RawShopifyDiscountCode,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopaccino/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeRule(overrides: Partial<RawShopifyPriceRule> = {}): RawShopifyPriceRule {
  return {
    id: 777001,
    title: 'Summer10',
    target_type: 'line_item',
    target_selection: 'all',
    allocation_method: 'across',
    value_type: 'percentage',
    value: '-10.0',
    customer_selection: 'all',
    starts_at: '2024-06-01T00:00:00.000Z',
    ends_at: '2024-08-31T23:59:59.000Z',
    created_at: '2024-05-20T00:00:00.000Z',
    ...overrides,
  }
}

const makeCode = (overrides: Partial<RawShopifyDiscountCode> = {}): RawShopifyDiscountCode => ({
  id: 888001,
  code: 'SUMMER10',
  usage_count: 5,
  ...overrides,
})

describe('shopaccino transformDiscount', () => {
  it('maps id to string and attaches code', () => {
    const result = transformDiscount(makeRule(), makeCode())
    expect(result.id).toBe('777001')
    expect(result.code).toBe('SUMMER10')
  })

  it('maps percentage type and keeps value positive', () => {
    // Shopify stores value as negative string (-10.0); adapter flips sign
    const result = transformDiscount(makeRule())
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
  })

  it('maps FIXED_AMOUNT type and converts value to minor units', () => {
    const result = transformDiscount(makeRule({ value_type: 'fixed_amount', value: '-20.00' }))
    // Math.abs(-20.00) = 20 USD = 2000 cents
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(2000)
  })

  it('maps FREE_SHIPPING when target_type is shipping_line', () => {
    const result = transformDiscount(makeRule({ target_type: 'shipping_line' }))
    expect(result.type).toBe('FREE_SHIPPING')
  })

  it('maps appliesTo ORDER when target_selection is all', () => {
    const result = transformDiscount(makeRule())
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps customerEligibility ALL', () => {
    const result = transformDiscount(makeRule(), makeCode())
    expect(result.customerEligibility).toBe('ALL')
  })

  it('produces output that passes DiscountSchema', () => {
    const result = transformDiscount(makeRule(), makeCode())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformDiscount restoring negative value', () => {
    const canonical = transformDiscount(makeRule(), makeCode())
    const back = untransformDiscount(canonical)
    // Shopify untransform stores the value as a negative string
    expect(back.value_type).toBe('percentage')
    expect(Number(back.value)).toBe(-10)
  })
})
