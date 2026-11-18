/**
 * SendOwl Discount → canonical Discount.
 *
 * Field shapes verified against
 * https://dashboard.sendowl.com/developers/api/discounts (2026-09-13):
 *  - list/get responses wrap the object under a `discount` key
 *  - exactly one of `fixed_discount` / `percentage_discount` is set, both
 *    decimal strings (e.g. `"5.00"`, `"10.5"`)
 *  - `usage_limit`, `expires_at`, `minimum_cart_value`, `multiple_codes`,
 *    `limited_to_products` are confirmed fields
 */
import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawSendOwlDiscount,
} from '../../../../../../../src/verticals/ecommerce/adapters/sendowl/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeDiscount(overrides: Partial<RawSendOwlDiscount> = {}): RawSendOwlDiscount {
  return {
    id: 3,
    name: '10% off coupon',
    code: '770e805909',
    percentage_discount: '10.0',
    usage_limit: 100,
    minimum_cart_value: 50,
    expires_at: '2011-06-02T18:51:00Z',
    created_at: '2011-06-02T19:02:18Z',
    multiple_codes: false,
    limited_to_products: true,
    ...overrides,
  }
}

describe('transformDiscount (sendowl)', () => {
  it('maps percentage discounts', () => {
    const result = transformDiscount(makeDiscount())
    expect(result.id).toBe('3')
    expect(result.code).toBe('770e805909')
    expect(result.title).toBe('10% off coupon')
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
  })

  it('maps fixed-amount discounts to minor units', () => {
    const raw = makeDiscount({ percentage_discount: undefined, fixed_discount: '5.00' })
    const result = transformDiscount(raw)
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(5)
  })

  it('maps usage limit and expiry', () => {
    const result = transformDiscount(makeDiscount())
    expect(result.usageLimit).toBe(100)
    expect(result.endsAt).toBe('2011-06-02T18:51:00Z')
  })

  it('never populates minimumPurchaseAmount or currency — SendOwl reports no currency for a discount', () => {
    const result = transformDiscount(makeDiscount())
    expect(result.minimumPurchaseAmount).toBeUndefined()
    expect(result.currency).toBeUndefined()
    // The raw minimum_cart_value is still reachable via metadata.
    expect(result.metadata['minimum_cart_value']).toBe(50)
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeDiscount()
    const result = transformDiscount(raw)
    expect(result.metadata).toEqual(raw)
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    expect(() => DiscountSchema.parse(transformDiscount(makeDiscount()))).not.toThrow()
  })

  it('satisfies DiscountSchema for a fixed discount with no code yet (auto-generated)', () => {
    const raw = makeDiscount({ code: undefined, percentage_discount: undefined, fixed_discount: '2.50' })
    expect(() => DiscountSchema.parse(transformDiscount(raw))).not.toThrow()
  })

  it('round-trips a percentage discount via untransformDiscount', () => {
    const canonical = transformDiscount(makeDiscount())
    const raw = untransformDiscount(canonical)
    expect(raw['name']).toBe('10% off coupon')
    expect(raw['percentage_discount']).toBe('10')
    expect(raw['usage_limit']).toBe(100)
  })

  it('round-trips a fixed-amount discount via untransformDiscount', () => {
    const canonical = transformDiscount(makeDiscount({ percentage_discount: undefined, fixed_discount: '5.00' }))
    const raw = untransformDiscount(canonical)
    expect(raw['fixed_discount']).toBe('5')
    expect(raw['percentage_discount']).toBeUndefined()
  })
})
