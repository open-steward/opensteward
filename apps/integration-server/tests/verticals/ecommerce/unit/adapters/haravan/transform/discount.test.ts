/**
 * Haravan Discount transform — verified against
 * https://docs.haravan.com/docs/omni-apis/discount/discount-codes/ raw doc
 * HTML: one flat object (not Shopify's PriceRule+DiscountCode split),
 * `discount_type` enum `fixed_amount|percentage|shipping`.
 */
import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  type RawHaravanDiscount,
} from '../../../../../../../src/verticals/ecommerce/adapters/haravan/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeRaw(overrides: Partial<RawHaravanDiscount> = {}): RawHaravanDiscount {
  return {
    id: 1016875801,
    code: 'GARMIN55',
    discount_type: 'fixed_amount',
    value: 150000,
    minimum_order_amount: 0,
    usage_limit: 1,
    times_used: 1,
    status: 'enabled',
    starts_at: '2021-05-13T07:29:20.1Z',
    ends_at: null,
    created_at: '2021-05-13T07:29:20.1Z',
    ...overrides,
  }
}

describe('transformDiscount (haravan)', () => {
  it('maps id, code, and type', () => {
    const result = transformDiscount(makeRaw(), 'VND')
    expect(result.id).toBe('1016875801')
    expect(result.code).toBe('GARMIN55')
    expect(result.type).toBe('FIXED_AMOUNT')
  })

  it('attaches the shop currency to a money-typed value but not a percentage', () => {
    expect(transformDiscount(makeRaw({ discount_type: 'fixed_amount', value: 150000 }), 'VND').currency).toBe('VND')
    expect(transformDiscount(makeRaw({ discount_type: 'percentage', value: 10 }), 'VND').currency).toBeUndefined()
  })

  it('maps usageLimit and usageCount', () => {
    const result = transformDiscount(makeRaw(), 'VND')
    expect(result.usageLimit).toBe(1)
    expect(result.usageCount).toBe(1)
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    expect(() => DiscountSchema.parse(transformDiscount(makeRaw(), 'VND'))).not.toThrow()
  })
})
