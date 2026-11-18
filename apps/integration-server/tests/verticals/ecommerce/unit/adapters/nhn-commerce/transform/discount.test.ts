import { describe, it, expect } from 'vitest'
import {
  transformCoupon,
  type RawNhnCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/nhn-commerce/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeRaw(overrides: Partial<RawNhnCoupon> = {}): RawNhnCoupon {
  return {
    couponNo: 9001,
    couponName: '10% 할인 쿠폰',
    couponType: 'CART_COUPON',
    discountType: 'PERCENT',
    discountRate: 10,
    minSalePrice: 20000,
    useYn: 'Y',
    issueYmdt: '2024-03-01T00:00:00Z',
    usePeriodStartYmdt: '2024-03-01T00:00:00Z',
    usePeriodEndYmdt: '2024-03-31T00:00:00Z',
    promotionCode: 'CART10',
    downloadable: true,
    ...overrides,
  }
}

describe('transformCoupon (NHN Commerce)', () => {
  it('maps couponNo to string canonical id', () => {
    const result = transformCoupon(makeRaw())
    expect(result.id).toBe('9001')
  })

  it('maps couponName to title', () => {
    const result = transformCoupon(makeRaw())
    expect(result.title).toBe('10% 할인 쿠폰')
  })

  it('maps PERCENT discountType to PERCENTAGE', () => {
    const result = transformCoupon(makeRaw())
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
  })

  it('maps WON discountType to FIXED_AMOUNT', () => {
    const result = transformCoupon(
      makeRaw({ discountType: 'WON', discountAmt: 5000, discountRate: null }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    // KRW 0 decimal digits → majorToMinor(5000) = 5000
    expect(result.value).toBe(5000)
  })

  it('maps DELIVERY_COUPON to FREE_SHIPPING type and SHIPPING appliesTo', () => {
    const result = transformCoupon(makeRaw({ couponType: 'DELIVERY_COUPON' }))
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps CART_COUPON to ORDER appliesTo', () => {
    const result = transformCoupon(makeRaw())
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps PRODUCT_COUPON to PRODUCTS appliesTo', () => {
    const result = transformCoupon(makeRaw({ couponType: 'PRODUCT_COUPON' }))
    expect(result.appliesTo).toBe('PRODUCTS')
  })

  it('maps promotionCode to code', () => {
    const result = transformCoupon(makeRaw())
    expect(result.code).toBe('CART10')
  })

  it('maps minSalePrice to minimumPurchaseAmount', () => {
    const result = transformCoupon(makeRaw())
    // KRW 0 decimal digits → 20000 stays 20000
    expect(result.minimumPurchaseAmount).toEqual({ amount: 20000, currency: 'KRW' })
  })

  it('maps period dates to ISO strings', () => {
    const result = transformCoupon(makeRaw())
    expect(result.startsAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.endsAt).toBe('2024-03-31T00:00:00.000Z')
  })

  it('maps issueYmdt to createdAt', () => {
    const result = transformCoupon(makeRaw())
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    const result = transformCoupon(makeRaw())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })
})
