import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawOpenCartCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/opencart/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeCoupon(
  overrides: Partial<RawOpenCartCoupon> = {},
): RawOpenCartCoupon {
  return {
    coupon_id: 3001,
    name: '10% Off Everything',
    code: 'SAVE10',
    type: 'P',
    discount: '10.00',
    logged: 0,
    free_shipping: 0,
    total: '50.00',
    date_start: '2024-01-01T00:00:00.000Z',
    date_end: '2024-12-31T00:00:00.000Z',
    uses_total: 100,
    uses_customer: 1,
    status: 1,
    product: [],
    category: [],
    date_added: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformDiscount (OpenCart)', () => {
  it('maps percentage-type coupons correctly', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.id).toBe('3001')
    expect(typeof result.id).toBe('string')
    expect(result.code).toBe('SAVE10')
    expect(result.title).toBe('10% Off Everything')
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
    expect(result.usageLimit).toBe(100)
    expect(result.appliesTo).toBe('ORDER')
    expect(result.endsAt).toBe('2024-12-31T00:00:00.000Z')
  })

  it('maps minimum purchase amount from total field', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.minimumPurchaseAmount).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('maps fixed-amount coupons (type F)', () => {
    const result = transformDiscount(
      makeCoupon({ type: 'F', discount: '15.00' }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(15)
    expect(result.appliesTo).toBe('ORDER')
  })

  it('detects FREE_SHIPPING when free_shipping is 1', () => {
    const result = transformDiscount(
      makeCoupon({ free_shipping: 1 }),
    )
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps product-specific coupons', () => {
    const result = transformDiscount(
      makeCoupon({ product: [42, 43] }),
    )
    expect(result.appliesTo).toBe('PRODUCTS')
    expect(result.productIds).toEqual(['42', '43'])
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeCoupon()
    const result = transformDiscount(raw)
    expect(result.metadata).toBe(raw)
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformDiscount', () => {
    const canonical = transformDiscount(makeCoupon())
    const body = untransformDiscount(canonical)
    expect(body['code']).toBe('SAVE10')
    expect(body['type']).toBe('P')
    expect(body['discount']).toBe(10)
    expect(body['uses_total']).toBe(100)
  })

  it('untransform maps FREE_SHIPPING to free_shipping=1', () => {
    const body = untransformDiscount({ type: 'FREE_SHIPPING', code: 'FREESHIP' })
    expect(body['free_shipping']).toBe(1)
    expect(body['type']).toBeUndefined()
  })
})
