import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawStoreHippoCouponCode,
} from '../../../../../../../src/verticals/ecommerce/adapters/storehippo/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'
import { COUPON_CODE } from '../fixtures'

const raw = (): RawStoreHippoCouponCode => structuredClone(COUPON_CODE) as RawStoreHippoCouponCode

describe('StoreHippo transformDiscount (documented ms-coupon_codes fields)', () => {
  it('maps the documented flat example and parses with DiscountSchema', () => {
    const d = DiscountSchema.parse(transformDiscount(raw(), 'INR'))
    expect(d).toMatchObject({
      id: '59316a9c1da5cdb0168f2936',
      code: 'GET 25',
      type: 'FIXED_AMOUNT',
      value: 2500,
      currency: 'INR',
      usageLimit: 3,
      startsAt: '2018-04-25T06:48:00.000Z',
      endsAt: '2018-04-30T06:48:00.000Z',
    })
  })

  it('a percentage coupon carries the percent and no currency', () => {
    const d = DiscountSchema.parse(
      transformDiscount({ ...raw(), type: 'percentage', amount: 10 }, 'INR'),
    )
    expect(d.type).toBe('PERCENTAGE')
    expect(d.value).toBe(10)
    expect(d.currency).toBeUndefined()
  })

  it('a custom type is unknown, with no value', () => {
    const d = DiscountSchema.parse(transformDiscount({ ...raw(), type: 'bogo' }, 'INR'))
    expect(d.type).toBe('unknown')
    expect(d.value).toBeUndefined()
  })

  it('throws on a record without _id', () => {
    expect(() => transformDiscount({ coupon_code: 'X' }, 'INR')).toThrow(/_id/)
  })

  it('untransformDiscount maps the code', () => {
    expect(untransformDiscount({ code: 'GET 25' })['code']).toBe('GET 25')
  })
})
