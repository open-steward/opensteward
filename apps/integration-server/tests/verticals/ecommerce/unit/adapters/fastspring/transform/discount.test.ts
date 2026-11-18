/**
 * FastSpring Coupon transform tests.
 *
 * Raw shape per https://developer.fastspring.com/reference/retrieve-a-coupon
 * and https://developer.fastspring.com/reference/create-or-update-coupon.
 */
import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawFastSpringCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/fastspring/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

describe('FastSpring transform/discount', () => {
  it('maps a percent coupon and survives DiscountSchema.parse', () => {
    const raw: RawFastSpringCoupon = {
      coupon: 'new-subscriber-offer',
      discount: { hasMultipleDiscounts: false, discounts: [], type: 'percent', percent: 50 },
      reason: { en: '50% off for your first 3 months' },
      limit: '500',
      available: { start: '2026-06-01', end: '2026-08-31' },
      codes: ['NEWSUB50'],
      products: ['pro-plan-monthly', 'pro-plan-annual'],
    }
    const discount = transformDiscount(raw)
    expect(DiscountSchema.parse(discount)).toBeTruthy()
    expect(discount.id).toBe('new-subscriber-offer')
    expect(discount.code).toBe('NEWSUB50')
    expect(discount.type).toBe('PERCENTAGE')
    expect(discount.value).toBe(50)
    expect(discount.appliesTo).toBe('PRODUCTS')
    expect(discount.usageLimit).toBe(500)
    expect(discount.startsAt).toBe('2026-06-01T00:00:00.000Z')
  })

  it('maps a flat/order-level coupon, converting decimal amount to minor units', () => {
    const raw: RawFastSpringCoupon = {
      coupon: 'summer-sale-2026',
      orderLevelDiscount: true,
      discount: { hasMultipleDiscounts: false, discounts: [], type: 'flat', amount: { USD: 10, EUR: 9 } },
      codes: ['SUMMER10'],
      products: [],
    }
    const discount = transformDiscount(raw)
    expect(DiscountSchema.parse(discount)).toBeTruthy()
    expect(discount.type).toBe('FIXED_AMOUNT')
    expect(discount.value).toBe(1000)
    expect(discount.currency).toBe('USD')
    expect(discount.appliesTo).toBe('ORDER')
  })

  it('falls back to the first tier of a multi-discount coupon', () => {
    const raw: RawFastSpringCoupon = {
      coupon: 'annual-upgrade-promo',
      discount: {
        hasMultipleDiscounts: true,
        discounts: [
          { type: 'percent', percent: 50, products: ['pro-plan-annual'] },
          { type: 'percent', percent: 25, products: ['pro-plan-monthly'] },
        ],
      },
      codes: ['ANNUAL50', 'ANNUAL25'],
      products: ['pro-plan-annual', 'pro-plan-monthly'],
    }
    const discount = transformDiscount(raw)
    expect(DiscountSchema.parse(discount)).toBeTruthy()
    expect(discount.type).toBe('PERCENTAGE')
    expect(discount.value).toBe(50)
    expect(discount.metadata).toEqual(raw)
  })

  it('treats an empty limit string as unlimited (undefined usageLimit)', () => {
    const raw: RawFastSpringCoupon = { coupon: 'x', limit: '' }
    const discount = transformDiscount(raw)
    expect(DiscountSchema.parse(discount)).toBeTruthy()
    expect(discount.usageLimit).toBeUndefined()
  })

  it('untransformDiscount builds a percent-coupon upsert body', () => {
    const raw: RawFastSpringCoupon = {
      coupon: 'new-subscriber-offer',
      discount: { hasMultipleDiscounts: false, discounts: [], type: 'percent', percent: 50 },
      reason: { en: '50% off' },
      codes: ['NEWSUB50'],
      products: ['pro-plan-monthly'],
    }
    const discount = transformDiscount(raw)
    const body = untransformDiscount(discount)
    expect(body).toMatchObject({
      coupon: 'new-subscriber-offer',
      discount: { type: 'percent', percent: 50 },
      reason: { en: '50% off' },
      codes: ['NEWSUB50'],
      products: ['pro-plan-monthly'],
    })
  })

  it('untransformDiscount builds a flat-coupon upsert body with decimal amount', () => {
    const discount = transformDiscount({
      coupon: 'summer-sale-2026',
      orderLevelDiscount: true,
      discount: { type: 'flat', amount: { USD: 10 } },
      codes: ['SUMMER10'],
    })
    const body = untransformDiscount(discount)
    expect(body).toMatchObject({
      coupon: 'summer-sale-2026',
      orderLevelDiscount: true,
      discount: { type: 'flat', amount: { USD: 10 } },
    })
  })
})
