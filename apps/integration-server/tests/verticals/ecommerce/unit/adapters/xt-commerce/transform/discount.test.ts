import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawWooCommerceCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/xt-commerce/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeCoupon(
  overrides: Partial<RawWooCommerceCoupon> = {},
): RawWooCommerceCoupon {
  return {
    id: 10,
    code: 'SUMMER10',
    amount: '10',
    discount_type: 'percent',
    description: 'Summer sale 10% off',
    usage_count: 3,
    usage_limit: 100,
    date_created_gmt: '2024-06-01T00:00:00Z',
    date_expires_gmt: '2024-08-31T23:59:59Z',
    ...overrides,
  }
}

describe('transformDiscount (xt-commerce)', () => {
  it('maps id to string', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.id).toBe('10')
  })

  it('maps code', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.code).toBe('SUMMER10')
  })

  it('maps title to code', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.title).toBe('SUMMER10')
  })

  it('maps discount_type=percent to PERCENTAGE type', () => {
    const result = transformDiscount(makeCoupon({ discount_type: 'percent' }))
    expect(result.type).toBe('PERCENTAGE')
  })

  it('maps discount_type=fixed_cart to FIXED_AMOUNT type and ORDER applies-to', () => {
    const result = transformDiscount(
      makeCoupon({ discount_type: 'fixed_cart', amount: '25' }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps discount_type=fixed_product to FIXED_AMOUNT type', () => {
    const result = transformDiscount(
      makeCoupon({ discount_type: 'fixed_product', amount: '5' }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
  })

  it('maps free_shipping=true to FREE_SHIPPING type and SHIPPING applies-to', () => {
    const result = transformDiscount(makeCoupon({ free_shipping: true }))
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('converts FIXED_AMOUNT value to minor units', () => {
    const result = transformDiscount(
      makeCoupon({ discount_type: 'fixed_cart', amount: '25.00' }),
    )
    expect(result.value).toBe(2500)
  })

  it('keeps PERCENTAGE value as number (not minor units)', () => {
    const result = transformDiscount(makeCoupon({ discount_type: 'percent', amount: '10' }))
    expect(result.value).toBe(10)
  })

  it('maps product_ids to string array', () => {
    const result = transformDiscount(
      makeCoupon({ product_ids: [1, 2, 3], discount_type: 'fixed_product' }),
    )
    expect(result.productIds).toEqual(['1', '2', '3'])
  })

  it('maps product_categories to collectionIds', () => {
    const result = transformDiscount(makeCoupon({ product_categories: [5, 6] }))
    expect(result.collectionIds).toEqual(['5', '6'])
  })

  it('maps minimum_amount to minimumPurchaseAmount in minor units', () => {
    const result = transformDiscount(makeCoupon({ minimum_amount: '50.00' }))
    expect(result.minimumPurchaseAmount?.amount).toBe(5000)
    expect(result.minimumPurchaseAmount?.currency).toBe('USD')
  })

  it('maps usage_limit', () => {
    const result = transformDiscount(makeCoupon({ usage_limit: 100 }))
    expect(result.usageLimit).toBe(100)
  })

  it('maps usage_count', () => {
    const result = transformDiscount(makeCoupon({ usage_count: 3 }))
    expect(result.usageCount).toBe(3)
  })

  it('uses date_expires_gmt for endsAt', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.endsAt).toBe('2024-08-31T23:59:59Z')
  })

  it('uses date_created_gmt for createdAt', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.createdAt).toBe('2024-06-01T00:00:00Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCoupon()
    const result = transformDiscount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying DiscountSchema', () => {
    const result = transformDiscount(makeCoupon())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })
})

describe('untransformDiscount (xt-commerce)', () => {
  it('maps PERCENTAGE type to percent discount_type', () => {
    const body = untransformDiscount({ type: 'PERCENTAGE', value: 15 })
    expect(body['discount_type']).toBe('percent')
    expect(body['amount']).toBe('15')
  })

  it('maps FIXED_AMOUNT type with ORDER scope to fixed_cart', () => {
    const body = untransformDiscount({ type: 'FIXED_AMOUNT', appliesTo: 'ORDER', value: 500 })
    expect(body['discount_type']).toBe('fixed_cart')
    // minor units → major: 500 / 100 = 5.00
    expect(body['amount']).toBe('5')
  })

  it('maps FREE_SHIPPING type to free_shipping=true', () => {
    const body = untransformDiscount({ type: 'FREE_SHIPPING' })
    expect(body['free_shipping']).toBe(true)
  })

  it('maps endsAt to date_expires', () => {
    const body = untransformDiscount({ endsAt: '2024-12-31T23:59:59Z' })
    expect(body['date_expires']).toBe('2024-12-31T23:59:59Z')
  })
})
