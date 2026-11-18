import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawEverShopCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/evershop/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeCoupon(overrides: Partial<RawEverShopCoupon> = {}): RawEverShopCoupon {
  return {
    coupon_id: 12,
    uuid: 'coupon-uuid-1',
    coupon: 'EVERSHOP20',
    status: 1,
    description: '20% off your order',
    discount_amount: 20,
    free_shipping: 0,
    discount_type: 'percentage',
    used_time: 7,
    max_uses_time_per_coupon: 100,
    start_date: '2024-03-01T00:00:00Z',
    end_date: '2024-09-01T00:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
    condition: { order_total: '50.00' },
    ...overrides,
  }
}

describe('transformDiscount (EverShop)', () => {
  it('uses uuid as id when available', () => {
    const result = transformDiscount(makeCoupon({ uuid: 'coupon-uuid-1' }))
    expect(result.id).toBe('coupon-uuid-1')
  })

  it('falls back to string coupon_id when uuid is absent', () => {
    const result = transformDiscount(makeCoupon({ uuid: undefined }))
    expect(result.id).toBe('12')
  })

  it('maps coupon code', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.code).toBe('EVERSHOP20')
  })

  it('maps description to title', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.title).toBe('20% off your order')
  })

  it('maps discount_type "percentage" to PERCENTAGE', () => {
    const result = transformDiscount(makeCoupon({ discount_type: 'percentage' }))
    expect(result.type).toBe('PERCENTAGE')
  })

  it('maps discount_type "fixed" to FIXED_AMOUNT', () => {
    const result = transformDiscount(makeCoupon({ discount_type: 'fixed', discount_amount: 10 }))
    expect(result.type).toBe('FIXED_AMOUNT')
  })

  it('maps discount_type "buy_x_get_y" to BUY_X_GET_Y', () => {
    const result = transformDiscount(makeCoupon({ discount_type: 'buy_x_get_y' }))
    expect(result.type).toBe('BUY_X_GET_Y')
  })

  it('keeps PERCENTAGE value as-is', () => {
    const result = transformDiscount(
      makeCoupon({ discount_type: 'percentage', discount_amount: 20 }),
    )
    expect(result.value).toBe(20)
  })

  it('converts FIXED_AMOUNT value from USD major to minor units', () => {
    const result = transformDiscount(makeCoupon({ discount_type: 'fixed', discount_amount: 10 }))
    expect(result.value).toBe(1000)
  })

  it('maps minimumPurchaseAmount from condition.order_total', () => {
    const result = transformDiscount(makeCoupon({ condition: { order_total: '50.00' } }))
    expect(result.minimumPurchaseAmount).toBeDefined()
    expect(result.minimumPurchaseAmount!.amount).toBe(5000)
    expect(result.minimumPurchaseAmount!.currency).toBe('USD')
  })

  it('omits minimumPurchaseAmount when condition.order_total is 0', () => {
    const result = transformDiscount(makeCoupon({ condition: { order_total: '0' } }))
    expect(result.minimumPurchaseAmount).toBeUndefined()
  })

  it('maps appliesTo SHIPPING when free_shipping is truthy', () => {
    const result = transformDiscount(makeCoupon({ free_shipping: 1 }))
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps appliesTo ORDER when no free_shipping and no product targets', () => {
    const result = transformDiscount(makeCoupon({ free_shipping: 0, target_products: null }))
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps appliesTo PRODUCTS when target_products has products', () => {
    const result = transformDiscount(
      makeCoupon({ free_shipping: 0, target_products: { products: [1, 2] } }),
    )
    expect(result.appliesTo).toBe('PRODUCTS')
    expect(result.productIds).toEqual(['1', '2'])
  })

  it('maps usageLimit from max_uses_time_per_coupon', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.usageLimit).toBe(100)
  })

  it('maps usageCount from used_time', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.usageCount).toBe(7)
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

describe('untransformDiscount (EverShop)', () => {
  it('maps PERCENTAGE type to "percentage"', () => {
    const body = untransformDiscount({ type: 'PERCENTAGE', value: 20 })
    expect(body['discount_type']).toBe('percentage')
  })

  it('maps FIXED_AMOUNT type to "fixed"', () => {
    const body = untransformDiscount({ type: 'FIXED_AMOUNT', value: 1000, currency: 'USD' })
    expect(body['discount_type']).toBe('fixed')
  })

  it('converts FIXED_AMOUNT minor units back to major-unit decimal', () => {
    const body = untransformDiscount({ type: 'FIXED_AMOUNT', value: 1000, currency: 'USD' })
    // 1000 cents = 10.00 USD
    expect(body['discount_amount']).toBe(10)
  })

  it('maps BUY_X_GET_Y to "buy_x_get_y"', () => {
    const body = untransformDiscount({ type: 'BUY_X_GET_Y' })
    expect(body['discount_type']).toBe('buy_x_get_y')
  })

  it('sets free_shipping to 1 when appliesTo is SHIPPING', () => {
    const body = untransformDiscount({ appliesTo: 'SHIPPING' })
    expect(body['free_shipping']).toBe(1)
  })

  it('maps code to coupon', () => {
    const body = untransformDiscount({ code: 'SAVE20' })
    expect(body['coupon']).toBe('SAVE20')
  })
})
