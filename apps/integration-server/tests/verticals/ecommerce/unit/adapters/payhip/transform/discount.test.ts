import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawPayhipCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/payhip/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeCoupon(overrides: Partial<RawPayhipCoupon> = {}): RawPayhipCoupon {
  return {
    id: 101,
    code: 'SAVE15',
    coupon_type: 'multi',
    percent_off: 15,
    amount_off: null,
    start_date: '2024-01-01T00:00:00Z',
    end_date: '2024-12-31T23:59:59Z',
    usage_limit: 50,
    notes: 'Summer sale coupon',
    ...overrides,
  }
}

describe('transformDiscount (payhip)', () => {
  describe('percentage coupon', () => {
    it('maps type to PERCENTAGE and preserves the percentage value', () => {
      const result = transformDiscount(makeCoupon())
      expect(result.id).toBe('101')
      expect(typeof result.id).toBe('string')
      expect(result.code).toBe('SAVE15')
      expect(result.type).toBe('PERCENTAGE')
      expect(result.value).toBe(15)
    })

    it('maps coupon_type=multi to appliesTo ORDER', () => {
      const result = transformDiscount(makeCoupon())
      expect(result.appliesTo).toBe('ORDER')
    })

    it('maps notes as title and falls back to code when notes is absent', () => {
      const result = transformDiscount(makeCoupon())
      expect(result.title).toBe('Summer sale coupon')

      const noNotes = transformDiscount(makeCoupon({ notes: null }))
      expect(noNotes.title).toBe('SAVE15')
    })

    it('maps usage limit and date range', () => {
      const result = transformDiscount(makeCoupon())
      expect(result.usageLimit).toBe(50)
      expect(result.startsAt).toBe('2024-01-01T00:00:00.000Z')
      expect(result.endsAt).toBe('2024-12-31T23:59:59.000Z')
    })

    it('preserves raw payload in metadata', () => {
      const raw = makeCoupon()
      const result = transformDiscount(raw)
      expect(result.metadata).toBe(raw)
    })

    it('produces a payload that satisfies DiscountSchema', () => {
      const result = transformDiscount(makeCoupon())
      expect(() => DiscountSchema.parse(result)).not.toThrow()
    })
  })

  describe('fixed amount coupon', () => {
    it('maps type to FIXED_AMOUNT and passes amount_off through in cents', () => {
      const result = transformDiscount(
        makeCoupon({ coupon_type: 'single', percent_off: null, amount_off: 500, product_key: 'prod-abc' }),
      )
      expect(result.type).toBe('FIXED_AMOUNT')
      expect(result.value).toBe(500)
    })

    it('maps coupon_type=single to appliesTo PRODUCTS and populates productIds', () => {
      const result = transformDiscount(
        makeCoupon({ coupon_type: 'single', percent_off: null, amount_off: 500, product_key: 'prod-abc' }),
      )
      expect(result.appliesTo).toBe('PRODUCTS')
      expect(result.productIds).toEqual(['prod-abc'])
      expect(result.collectionIds).toBeUndefined()
    })

    it('produces a payload that satisfies DiscountSchema', () => {
      const result = transformDiscount(
        makeCoupon({ coupon_type: 'single', percent_off: null, amount_off: 500, product_key: 'prod-abc' }),
      )
      expect(() => DiscountSchema.parse(result)).not.toThrow()
    })
  })

  describe('collection coupon', () => {
    it('maps coupon_type=collection to appliesTo PRODUCTS and populates collectionIds', () => {
      const result = transformDiscount(
        makeCoupon({ coupon_type: 'collection', collection_id: 77, percent_off: 20, amount_off: null }),
      )
      expect(result.appliesTo).toBe('PRODUCTS')
      expect(result.collectionIds).toEqual(['77'])
      expect(result.productIds).toBeUndefined()
    })
  })

  describe('minimum purchase amount', () => {
    it('maps minimum_purchase_amount when positive', () => {
      const result = transformDiscount(makeCoupon({ minimum_purchase_amount: 2000 }))
      expect(result.minimumPurchaseAmount).toEqual({ amount: 2000, currency: 'USD' })
    })

    it('omits minimumPurchaseAmount when zero or null', () => {
      expect(transformDiscount(makeCoupon({ minimum_purchase_amount: 0 })).minimumPurchaseAmount).toBeUndefined()
      expect(transformDiscount(makeCoupon({ minimum_purchase_amount: null })).minimumPurchaseAmount).toBeUndefined()
    })
  })

  describe('untransformDiscount', () => {
    it('round-trips a percentage coupon', () => {
      const canonical = transformDiscount(makeCoupon())
      const raw = untransformDiscount(canonical)
      expect(raw.code).toBe('SAVE15')
      expect(raw.percent_off).toBe(15)
      expect(raw.coupon_type).toBe('multi')
      expect(raw.usage_limit).toBe(50)
    })

    it('round-trips a fixed-amount coupon with productIds', () => {
      const canonical = transformDiscount(
        makeCoupon({ coupon_type: 'single', percent_off: null, amount_off: 500, product_key: 'prod-abc' }),
      )
      const raw = untransformDiscount(canonical)
      expect(raw.amount_off).toBe(500)
      expect(raw.coupon_type).toBe('single')
      expect(raw.product_key).toBe('prod-abc')
    })

    it('round-trips a collection coupon', () => {
      const canonical = transformDiscount(
        makeCoupon({ coupon_type: 'collection', collection_id: 77, percent_off: 20, amount_off: null }),
      )
      const raw = untransformDiscount(canonical)
      expect(raw.coupon_type).toBe('collection')
      expect(raw.collection_id).toBe('77')
    })
  })
})
