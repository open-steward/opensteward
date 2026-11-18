import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawWooCommerceCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/fnac-marketplace/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeRaw(overrides: Partial<RawWooCommerceCoupon> = {}): RawWooCommerceCoupon {
  return {
    id: 601,
    code: 'FNAC10',
    amount: '10',
    discount_type: 'percent',
    date_created_gmt: '2024-02-01T00:00:00Z',
    date_expires_gmt: '2024-12-31T00:00:00Z',
    usage_count: 3,
    usage_limit: 100,
    product_ids: [],
    ...overrides,
  }
}

describe('transformDiscount (FNAC/WooCommerce)', () => {
  it('maps id', () => {
    const result = transformDiscount(makeRaw())
    expect(result.id).toBe('601')
  })

  it('maps code and title from code field', () => {
    const result = transformDiscount(makeRaw())
    expect(result.code).toBe('FNAC10')
    expect(result.title).toBe('FNAC10')
  })

  it('maps percent → PERCENTAGE type', () => {
    const result = transformDiscount(makeRaw({ discount_type: 'percent', amount: '10' }))
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
  })

  it('maps fixed_cart → FIXED_AMOUNT type with minor units', () => {
    const result = transformDiscount(makeRaw({ discount_type: 'fixed_cart', amount: '5.00' }))
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(500)
  })

  it('maps free_shipping → FREE_SHIPPING type', () => {
    const result = transformDiscount(makeRaw({ free_shipping: true }))
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps appliesTo ORDER for fixed_cart', () => {
    const result = transformDiscount(makeRaw({ discount_type: 'fixed_cart' }))
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps appliesTo PRODUCTS for fixed_product with product_ids', () => {
    const result = transformDiscount(
      makeRaw({ discount_type: 'fixed_product', product_ids: [101, 102] }),
    )
    expect(result.appliesTo).toBe('PRODUCTS')
    expect(result.productIds).toEqual(['101', '102'])
  })

  it('maps usageCount and usageLimit', () => {
    const result = transformDiscount(makeRaw())
    expect(result.usageCount).toBe(3)
    expect(result.usageLimit).toBe(100)
  })

  it('maps endsAt from date_expires_gmt', () => {
    const result = transformDiscount(makeRaw())
    expect(result.endsAt).toBe('2024-12-31T00:00:00Z')
  })

  it('round-trips via untransformDiscount', () => {
    const result = transformDiscount(makeRaw())
    const body = untransformDiscount(result)
    expect(body.code).toBe('FNAC10')
    expect(body.discount_type).toBe('percent')
  })

  it('produces a payload satisfying DiscountSchema', () => {
    const result = transformDiscount(makeRaw())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })
})
