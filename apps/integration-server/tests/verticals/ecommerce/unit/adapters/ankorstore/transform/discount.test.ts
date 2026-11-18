import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawWooCommerceCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/ankorstore/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeCoupon(overrides: Partial<RawWooCommerceCoupon> = {}): RawWooCommerceCoupon {
  return {
    id: 55,
    code: 'SUMMER10',
    discount_type: 'percent',
    amount: '10',
    usage_count: 5,
    date_created_gmt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformDiscount (Ankorstore / WooCommerce)', () => {
  it('maps id to string', () => {
    const result = transformDiscount(makeCoupon({ id: 77 }))
    expect(result.id).toBe('77')
  })

  it('maps code', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.code).toBe('SUMMER10')
  })

  it('maps percent discount_type to PERCENTAGE', () => {
    const result = transformDiscount(makeCoupon({ discount_type: 'percent' }))
    expect(result.type).toBe('PERCENTAGE')
  })

  it('maps fixed_cart to FIXED_AMOUNT', () => {
    const result = transformDiscount(makeCoupon({ discount_type: 'fixed_cart' }))
    expect(result.type).toBe('FIXED_AMOUNT')
  })

  it('maps fixed_product to FIXED_AMOUNT', () => {
    const result = transformDiscount(makeCoupon({ discount_type: 'fixed_product' }))
    expect(result.type).toBe('FIXED_AMOUNT')
  })

  it('maps free_shipping to FREE_SHIPPING type', () => {
    const result = transformDiscount(makeCoupon({ free_shipping: true }))
    expect(result.type).toBe('FREE_SHIPPING')
  })

  it('keeps percentage value as-is (not converted to minor units)', () => {
    const result = transformDiscount(makeCoupon({ discount_type: 'percent', amount: '10' }))
    expect(result.value).toBe(10)
  })

  it('converts fixed_cart amount to minor units', () => {
    const result = transformDiscount(makeCoupon({ discount_type: 'fixed_cart', amount: '5.00' }))
    expect(result.value).toBe(500)
  })

  it('maps appliesTo ORDER for fixed_cart', () => {
    const result = transformDiscount(makeCoupon({ discount_type: 'fixed_cart' }))
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps appliesTo SHIPPING for free_shipping', () => {
    const result = transformDiscount(makeCoupon({ free_shipping: true }))
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps usage_count', () => {
    const result = transformDiscount(makeCoupon({ usage_count: 12 }))
    expect(result.usageCount).toBe(12)
  })

  it('maps usage_limit', () => {
    const result = transformDiscount(makeCoupon({ usage_limit: 100 }))
    expect(result.usageLimit).toBe(100)
  })

  it('maps minimum_amount to minimumPurchaseAmount in minor units', () => {
    const result = transformDiscount(makeCoupon({ minimum_amount: '20.00' }))
    expect(result.minimumPurchaseAmount?.amount).toBe(2000)
  })

  it('maps endsAt from date_expires_gmt', () => {
    const result = transformDiscount(makeCoupon({ date_expires_gmt: '2024-12-31T23:59:59Z' }))
    expect(result.endsAt).toBe('2024-12-31T23:59:59Z')
  })

  it('stores raw in metadata', () => {
    const raw = makeCoupon()
    const result = transformDiscount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying DiscountSchema', () => {
    const result = transformDiscount(makeCoupon())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })
})

describe('untransformDiscount (Ankorstore / WooCommerce)', () => {
  it('maps PERCENTAGE type to percent', () => {
    const body = untransformDiscount({ type: 'PERCENTAGE', value: 10 })
    expect(body.discount_type).toBe('percent')
  })

  it('maps FIXED_AMOUNT with ORDER appliesTo to fixed_cart', () => {
    const body = untransformDiscount({ type: 'FIXED_AMOUNT', appliesTo: 'ORDER', value: 500 })
    expect(body.discount_type).toBe('fixed_cart')
  })

  it('maps FREE_SHIPPING type to free_shipping flag', () => {
    const body = untransformDiscount({ type: 'FREE_SHIPPING' })
    expect(body.free_shipping).toBe(true)
  })

  it('converts FIXED_AMOUNT value from minor to major units', () => {
    const body = untransformDiscount({ type: 'FIXED_AMOUNT', value: 1000 })
    expect(body.amount).toBe('10')
  })
})
