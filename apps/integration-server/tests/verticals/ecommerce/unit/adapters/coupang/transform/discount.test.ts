import { describe, it, expect } from 'vitest'
import {
  mapCouponType,
  transformDiscount,
} from '../../../../../../../src/verticals/ecommerce/adapters/coupang/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'
import { couponExample } from '../fixtures'

describe('transformDiscount (Coupang instant-discount coupon)', () => {
  it('maps the documented example and parses as a canonical Discount', () => {
    const d = DiscountSchema.parse(transformDiscount(couponExample()))
    expect(d).toEqual(
      expect.objectContaining({
        id: '2246326',
        type: 'PERCENTAGE',
        value: 30,
        customerEligibility: 'ALL',
      }),
    )
    // No currency is documented for coupons, and startAt/endAt carry no zone.
    expect(d.currency).toBeUndefined()
    expect(d.startsAt).toBeUndefined()
    expect(d.endsAt).toBeUndefined()
    // "promotionName": null in the example.
    expect(d.title).toBeUndefined()
  })

  it('maps a promotion name and a Rocket Wow exclusive coupon', () => {
    const d = DiscountSchema.parse(
      transformDiscount({
        ...couponExample(),
        promotionName: 'Jan dress coupon',
        wowExclusive: 'true',
      }),
    )
    expect(d.title).toBe('Jan dress coupon')
    expect(d.customerEligibility).toBe('SPECIFIC')
  })

  it('maps the documented discount types', () => {
    expect(['RATE', 'FIXED_WITH_QUANTITY', 'PRICE', 'OTHER'].map(mapCouponType)).toEqual([
      'PERCENTAGE',
      'FIXED_AMOUNT',
      'FIXED_AMOUNT',
      'unknown',
    ])
  })

  it('sends no value for a fixed-amount coupon, whose unit and currency are undocumented', () => {
    const d = DiscountSchema.parse(
      transformDiscount({ ...couponExample(), type: 'PRICE', discount: 1000 }),
    )
    expect(d.type).toBe('FIXED_AMOUNT')
    expect(d.value).toBeUndefined()
  })

  it('throws without a couponId', () => {
    expect(() => transformDiscount({ ...couponExample(), couponId: undefined })).toThrow(/couponId/)
  })
})
