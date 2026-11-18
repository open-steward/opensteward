import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawWooCommerceCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/wildberries/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeCoupon(overrides: Partial<RawWooCommerceCoupon> = {}): RawWooCommerceCoupon {
  return {
    id: 55,
    code: 'SAVE10',
    amount: '10.00',
    discount_type: 'fixed_cart',
    description: '10 off order',
    usage_count: 3,
    usage_limit: 100,
    date_created_gmt: '2024-01-01T00:00:00Z',
    date_expires_gmt: '2024-12-31T23:59:59Z',
    ...overrides,
  }
}

describe('transformDiscount (Wildberries/WooCommerce)', () => {
  it('maps core fields', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.id).toBe('55')
    expect(result.code).toBe('SAVE10')
    expect(result.title).toBe('SAVE10')
  })

  it('maps fixed_cart discount_type to FIXED_AMOUNT and converts to minor units', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.type).toBe('FIXED_AMOUNT')
    // 10.00 USD → 1000 cents
    expect(result.value).toBe(1000)
  })

  it('maps percent discount_type to PERCENTAGE and keeps value as-is', () => {
    const result = transformDiscount(makeCoupon({ discount_type: 'percent', amount: '15' }))
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(15)
  })

  it('maps fixed_product discount_type to FIXED_AMOUNT', () => {
    const result = transformDiscount(makeCoupon({ discount_type: 'fixed_product', amount: '5.00' }))
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(500)
  })

  it('free_shipping:true takes priority over discount_type for type', () => {
    const result = transformDiscount(makeCoupon({ free_shipping: true, discount_type: 'percent' }))
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps appliesTo ORDER for fixed_cart', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps appliesTo PRODUCTS for percent with product_ids', () => {
    const result = transformDiscount(
      makeCoupon({ discount_type: 'percent', product_ids: [10, 20] }),
    )
    expect(result.appliesTo).toBe('PRODUCTS')
    expect(result.productIds).toEqual(['10', '20'])
  })

  it('maps collectionIds from product_categories', () => {
    const result = transformDiscount(makeCoupon({ product_categories: [5, 6] }))
    expect(result.collectionIds).toEqual(['5', '6'])
  })

  it('maps usage fields', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.usageCount).toBe(3)
    expect(result.usageLimit).toBe(100)
  })

  it('maps minimumPurchaseAmount in minor units', () => {
    const result = transformDiscount(makeCoupon({ minimum_amount: '20.00' }))
    expect(result.minimumPurchaseAmount).toEqual({ amount: 2000, currency: 'USD' })
  })

  it('maps endsAt from date_expires_gmt', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.endsAt).toBe('2024-12-31T23:59:59Z')
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    expect(() => DiscountSchema.parse(transformDiscount(makeCoupon()))).not.toThrow()
  })

  it('preserves raw in metadata', () => {
    const raw = makeCoupon()
    expect(transformDiscount(raw).metadata).toBe(raw)
  })
})

describe('untransformDiscount (Wildberries/WooCommerce)', () => {
  it('maps PERCENTAGE type back to percent', () => {
    const result = untransformDiscount({ code: 'SAVE15', type: 'PERCENTAGE', value: 15 })
    expect(result.discount_type).toBe('percent')
    expect(result.amount).toBe('15')
  })

  it('maps FIXED_AMOUNT with ORDER appliesTo to fixed_cart and converts to major units', () => {
    const result = untransformDiscount({
      code: 'SAVE10',
      type: 'FIXED_AMOUNT',
      appliesTo: 'ORDER',
      value: 1000,
    })
    expect(result.discount_type).toBe('fixed_cart')
    expect(result.amount).toBe('10')
  })

  it('maps FREE_SHIPPING type to free_shipping:true', () => {
    const result = untransformDiscount({ type: 'FREE_SHIPPING' })
    expect(result.free_shipping).toBe(true)
    expect(result.discount_type).toBeUndefined()
  })

  it('maps minimumPurchaseAmount from minor to major units', () => {
    const result = untransformDiscount({
      minimumPurchaseAmount: { amount: 2000, currency: 'USD' },
    })
    expect(result.minimum_amount).toBe('20')
  })
})
