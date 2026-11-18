import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawWooCommerceCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/yampi/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeCoupon(overrides: Partial<RawWooCommerceCoupon> = {}): RawWooCommerceCoupon {
  return {
    id: 1,
    code: 'SAVE10',
    amount: '10',
    discount_type: 'percent',
    usage_count: 5,
    usage_limit: 100,
    date_created_gmt: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformDiscount (Yampi/WooCommerce)', () => {
  it('maps id and code', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.id).toBe('1')
    expect(result.code).toBe('SAVE10')
    expect(result.title).toBe('SAVE10')
  })

  it('maps percent discount_type to PERCENTAGE', () => {
    const result = transformDiscount(makeCoupon({ discount_type: 'percent' }))
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
  })

  it('maps fixed_cart to FIXED_AMOUNT and converts to minor units', () => {
    const result = transformDiscount(makeCoupon({ discount_type: 'fixed_cart', amount: '5.00' }))
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(500)
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps fixed_product to FIXED_AMOUNT', () => {
    const result = transformDiscount(makeCoupon({ discount_type: 'fixed_product', amount: '2.50' }))
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(250)
  })

  it('maps free_shipping to FREE_SHIPPING type and SHIPPING appliesTo', () => {
    const result = transformDiscount(makeCoupon({ free_shipping: true, discount_type: 'percent' }))
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps product_ids when fixed_product has restricted products', () => {
    const result = transformDiscount(
      makeCoupon({ discount_type: 'fixed_product', product_ids: [10, 20] }),
    )
    expect(result.productIds).toEqual(['10', '20'])
    expect(result.appliesTo).toBe('PRODUCTS')
  })

  it('maps minimum_amount to minimumPurchaseAmount in minor units', () => {
    const result = transformDiscount(makeCoupon({ minimum_amount: '50.00' }))
    expect(result.minimumPurchaseAmount).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('maps usage fields', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.usageCount).toBe(5)
    expect(result.usageLimit).toBe(100)
  })

  it('maps endsAt from date_expires_gmt', () => {
    const result = transformDiscount(makeCoupon({ date_expires_gmt: '2024-12-31T23:59:59Z' }))
    expect(result.endsAt).toBe('2024-12-31T23:59:59Z')
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    expect(() => DiscountSchema.parse(transformDiscount(makeCoupon()))).not.toThrow()
  })
})

describe('untransformDiscount (Yampi/WooCommerce)', () => {
  it('maps PERCENTAGE back to percent discount_type', () => {
    const result = untransformDiscount({ type: 'PERCENTAGE', value: 10, code: 'SAVE10' })
    expect(result.discount_type).toBe('percent')
    expect(result.amount).toBe('10')
  })

  it('maps FIXED_AMOUNT with ORDER appliesTo to fixed_cart', () => {
    const result = untransformDiscount({
      type: 'FIXED_AMOUNT',
      value: 500,
      appliesTo: 'ORDER',
    })
    expect(result.discount_type).toBe('fixed_cart')
    expect(result.amount).toBe('5')
  })

  it('maps FREE_SHIPPING back to free_shipping: true', () => {
    const result = untransformDiscount({ type: 'FREE_SHIPPING' })
    expect(result.free_shipping).toBe(true)
    expect(result.discount_type).toBeUndefined()
  })
})
