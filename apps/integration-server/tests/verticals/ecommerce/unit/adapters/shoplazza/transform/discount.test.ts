import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawShoplazzaPriceRule,
  type RawShoplazzaDiscountCode,
} from '../../../../../../../src/verticals/ecommerce/adapters/shoplazza/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeRule(overrides: Partial<RawShoplazzaPriceRule> = {}): RawShoplazzaPriceRule {
  return {
    id: 80001,
    title: 'Summer Deal',
    target_type: 'line_item',
    target_selection: 'all',
    allocation_method: 'across',
    value_type: 'percentage',
    // Shoplazza stores value as POSITIVE (unlike Shopify which uses negative)
    value: '15',
    customer_selection: 'all',
    starts_at: '2024-06-01T00:00:00.000Z',
    ends_at: '2024-08-31T23:59:59.000Z',
    created_at: '2024-05-20T00:00:00.000Z',
    ...overrides,
  }
}

const makeCode = (overrides: Partial<RawShoplazzaDiscountCode> = {}): RawShoplazzaDiscountCode => ({
  id: 90001,
  code: 'SUMMER15',
  usage_count: 10,
  ...overrides,
})

describe('shoplazza transformDiscount', () => {
  it('maps id to string and attaches code', () => {
    const result = transformDiscount(makeRule(), makeCode())
    expect(result.id).toBe('80001')
    expect(result.code).toBe('SUMMER15')
  })

  it('maps percentage type (value stored as positive in Shoplazza)', () => {
    const result = transformDiscount(makeRule())
    expect(result.type).toBe('PERCENTAGE')
    // value is 15 (positive in Shoplazza, unlike Shopify's -15)
    expect(result.value).toBe(15)
  })

  it('maps FIXED_AMOUNT type and converts to minor units', () => {
    // Shoplazza uses positive values; e.g. value '20' = $20
    const result = transformDiscount(makeRule({ value_type: 'fixed_amount', value: '20' }))
    expect(result.type).toBe('FIXED_AMOUNT')
    // 20 USD major = 2000 cents minor
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

  it('maps customerEligibility ALL from customer_selection=all', () => {
    const result = transformDiscount(makeRule(), makeCode())
    expect(result.customerEligibility).toBe('ALL')
  })

  it('produces output that passes DiscountSchema', () => {
    const result = transformDiscount(makeRule(), makeCode())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformDiscount (value stored positive in Shoplazza)', () => {
    const canonical = transformDiscount(makeRule(), makeCode())
    const back = untransformDiscount(canonical)
    expect(back.value_type).toBe('percentage')
    // Shoplazza expects positive values, so untransform should produce 15 (not -15)
    expect(Number(back.value)).toBe(15)
  })
})
