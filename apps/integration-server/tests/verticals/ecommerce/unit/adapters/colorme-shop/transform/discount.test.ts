/**
 * ColorMe Shop ShopCoupon → canonical Discount — verified against
 * paths["/v1/shop_coupons"] in https://api.shop-pro.jp/v1/spec/open_api.json.
 */
import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawColormeCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/colorme-shop/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeRaw(overrides: Partial<RawColormeCoupon> = {}): RawColormeCoupon {
  return {
    id: 1,
    name: 'Spring sale',
    code: 'SPRING500',
    coupon_type: 'amount',
    discount_amount: 500,
    minimum_amount: 3000,
    total_usage_limit: 100,
    starts_at: 1465784934,
    ends_at: 1494496809,
    created_at: 1465784934,
    ...overrides,
  }
}

describe('transformDiscount (colorme-shop)', () => {
  it('maps id, code, and FIXED_AMOUNT type with a currency', () => {
    const result = transformDiscount(makeRaw())
    expect(result.id).toBe('1')
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.currency).toBe('JPY')
  })

  it('maps a "rate" coupon to PERCENTAGE with no currency attached', () => {
    const result = transformDiscount(makeRaw({ coupon_type: 'rate', discount_amount: 10 }))
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
    expect(result.currency).toBeUndefined()
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    expect(() => DiscountSchema.parse(transformDiscount(makeRaw()))).not.toThrow()
  })

  it('round-trips writable fields via untransformDiscount', () => {
    const body = untransformDiscount(transformDiscount(makeRaw()))
    expect(body['coupon_type']).toBe('amount')
    expect(body['code']).toBe('SPRING500')
  })

  it('throws for a discount type ColorMe has no coupon_type for', () => {
    expect(() => untransformDiscount({ type: 'BUY_X_GET_Y' })).toThrow()
  })
})
