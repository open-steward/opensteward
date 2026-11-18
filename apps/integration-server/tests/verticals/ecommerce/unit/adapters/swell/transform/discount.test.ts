/**
 * Swell coupon transform, against "The coupon model" example
 * (https://developers.swell.is/backend-api/coupons).
 */
import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  type RawSwellCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/swell/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

const DOC_COUPON: RawSwellCoupon = {
  id: '60f199509111e70000000015',
  name: '10% Off Winter Jacket Sale',
  active: true,
  codes: [{ code: 'WINTER10' }],
  currency: 'USD',
  date_created: '2021-07-16T14:36:00.100Z',
  date_expired: '2018-03-01T00:00:00.000Z',
  date_updated: '2021-07-16T14:36:00.100Z',
  date_valid: '2018-11-01T00:00:00.000Z',
  description: 'Save 10% on all Winter Jackets for a limited time only.',
  discount_group: null,
  discounts: [
    {
      type: 'category',
      category_id: '5a97242bc65396a875c2d381',
      value_type: 'percent',
      value_fixed: 10,
    },
  ],
  limit_account_uses: 3,
  limit_code_uses: 10,
  limit_uses: 300,
  multi_codes: false,
  use_count: 184,
}

describe('swell transformDiscount', () => {
  it('maps the documented coupon example and parses as a Discount', () => {
    const d = DiscountSchema.parse(transformDiscount(DOC_COUPON))
    expect(d.id).toBe('60f199509111e70000000015')
    expect(d.code).toBe('WINTER10')
    expect(d.title).toBe('10% Off Winter Jacket Sale')
    expect(d.type).toBe('PERCENTAGE')
    // The example's rule is value_type=percent but carries only value_fixed.
    expect(d.value).toBeUndefined()
    expect(d.appliesTo).toBe('PRODUCTS')
    expect(d.collectionIds).toEqual(['5a97242bc65396a875c2d381'])
    expect(d.usageLimit).toBe(300)
    expect(d.usageCount).toBe(184)
    expect(d.startsAt).toBe('2018-11-01T00:00:00.000Z')
    expect(d.endsAt).toBe('2018-03-01T00:00:00.000Z')
  })

  it('reads a fixed total rule with its minimum', () => {
    const d = DiscountSchema.parse(
      transformDiscount({
        ...DOC_COUPON,
        discounts: [{ type: 'total', value_type: 'fixed', value_fixed: 5, total_min: 50 }],
      }),
    )
    // value_fixed is typed `currency` (major units); FIXED_AMOUNT carries minor units.
    expect(d).toMatchObject({
      type: 'FIXED_AMOUNT',
      value: 500,
      currency: 'USD',
      appliesTo: 'ORDER',
    })
    expect(d.minimumPurchaseAmount).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('omits a fixed value when the coupon has no currency', () => {
    const d = DiscountSchema.parse(
      transformDiscount({
        ...DOC_COUPON,
        currency: null,
        discounts: [{ type: 'total', value_type: 'fixed', value_fixed: 5, total_min: 50 }],
      }),
    )
    expect(d.type).toBe('FIXED_AMOUNT')
    expect(d.value).toBeUndefined()
    expect(d.minimumPurchaseAmount).toBeUndefined()
  })

  it('reads no code from a multi-code coupon even when one code is expanded', () => {
    const d = DiscountSchema.parse(
      transformDiscount({ ...DOC_COUPON, multi_codes: true, codes: [{ code: 'ONLY' }] }),
    )
    expect(d.code).toBeUndefined()
  })

  it('reads percent shipment and product rules', () => {
    const ship = DiscountSchema.parse(
      transformDiscount({
        ...DOC_COUPON,
        discounts: [{ type: 'shipment', value_type: 'percent', value_percent: 100 }],
      }),
    )
    expect(ship).toMatchObject({ type: 'PERCENTAGE', value: 100, appliesTo: 'SHIPPING' })
    const prod = DiscountSchema.parse(
      transformDiscount({
        ...DOC_COUPON,
        discounts: [{ type: 'product', value_type: 'fixed', value_fixed: 2, product_id: 'p1' }],
      }),
    )
    expect(prod).toMatchObject({ appliesTo: 'PRODUCTS', productIds: ['p1'], value: 200 })
  })

  it('leaves rule fields unset for a multi-rule coupon and code unset for multi-code', () => {
    const d = DiscountSchema.parse(
      transformDiscount({
        ...DOC_COUPON,
        multi_codes: true,
        codes: [{ code: 'A' }, { code: 'B' }],
        discounts: [
          { type: 'total', value_type: 'fixed', value_fixed: 5 },
          { type: 'shipment', value_type: 'percent', value_percent: 100 },
        ],
      }),
    )
    expect(d.code).toBeUndefined()
    expect(d.type).toBeUndefined()
    expect(d.value).toBeUndefined()
    expect(d.appliesTo).toBeUndefined()
  })
})
