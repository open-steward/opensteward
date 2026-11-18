import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawBigCommercePromotion,
  type RawBigCommerceCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/bigcommerce/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makePromotion(overrides: Partial<RawBigCommercePromotion> = {}): RawBigCommercePromotion {
  return {
    id: 3001,
    name: '10% Off Everything',
    status: 'enabled',
    rules: [
      {
        action: { cart_value: { discount: { percentage_amount: '10' } } },
        condition: { cart: { minimum_spend: '50.00' } },
      },
    ],
    max_uses: 100,
    current_uses: 25,
    start_date: '2024-01-01T00:00:00Z',
    end_date: '2024-12-31T23:59:59Z',
    date_created: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeCoupon(overrides: Partial<RawBigCommerceCoupon> = {}): RawBigCommerceCoupon {
  return {
    id: 4001,
    code: 'SAVE10',
    num_uses: 25,
    ...overrides,
  }
}

describe('transformDiscount', () => {
  it('maps core fields and parses percentage value', () => {
    const result = transformDiscount(makePromotion(), makeCoupon())
    expect(result.id).toBe('3001')
    expect(typeof result.id).toBe('string')
    expect(result.code).toBe('SAVE10')
    expect(result.title).toBe('10% Off Everything')
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
    expect(result.appliesTo).toBe('ORDER')
    expect(result.usageLimit).toBe(100)
    expect(result.usageCount).toBe(25)
  })

  it('maps the minimum spend as a minimum purchase amount', () => {
    const result = transformDiscount(makePromotion(), makeCoupon())
    expect(result.minimumPurchaseAmount).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('detects FIXED_AMOUNT discounts', () => {
    const result = transformDiscount(
      makePromotion({
        rules: [
          {
            action: { cart_value: { discount: { fixed_amount: '15' } } },
          },
        ],
      }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(15)
  })

  it('maps product-scoped promotions', () => {
    const result = transformDiscount(
      makePromotion({
        rules: [
          {
            action: { cart_value: { discount: { percentage_amount: '20' } } },
            condition: { cart: { items: { product_ids: [112, 113] } } },
          },
        ],
      }),
    )
    expect(result.appliesTo).toBe('PRODUCTS')
    expect(result.productIds).toEqual(['112', '113'])
  })

  it('preserves raw payload in metadata', () => {
    const promo = makePromotion()
    const coupon = makeCoupon()
    const result = transformDiscount(promo, coupon)
    expect((result.metadata as { promo: unknown }).promo).toBe(promo)
    expect((result.metadata as { coupon: unknown }).coupon).toBe(coupon)
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    const result = transformDiscount(makePromotion(), makeCoupon())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformDiscount', () => {
    const canonical = transformDiscount(makePromotion())
    const raw = untransformDiscount(canonical) as Record<string, unknown>
    expect(raw.name).toBe('10% Off Everything')
    expect(raw.max_uses).toBe(100)
  })
})
