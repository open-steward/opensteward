import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawEcwidCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/ecwid/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeCoupon(
  overrides: Partial<RawEcwidCoupon> = {},
): RawEcwidCoupon {
  return {
    id: 3001,
    name: '10% Off Everything',
    code: 'SAVE10',
    discountType: 'PERCENT',
    discount: 10,
    status: 'ACTIVE',
    creationDate: '2024-01-01T00:00:00Z',
    expirationDate: '2024-12-31T23:59:59Z',
    totalLimit: 100,
    orderCount: 25,
    catalogLimit: {
      products: [],
      categories: [],
    },
    ...overrides,
  }
}

describe('transformDiscount (Ecwid)', () => {
  it('maps percent-type coupons correctly', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.id).toBe('3001')
    expect(typeof result.id).toBe('string')
    expect(result.code).toBe('SAVE10')
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
    expect(result.usageLimit).toBe(100)
    expect(result.usageCount).toBe(25)
    expect(result.appliesTo).toBe('ORDER')
    expect(result.endsAt).toBe('2024-12-31T23:59:59Z')
  })

  it('maps ABS → FIXED_AMOUNT', () => {
    const result = transformDiscount(
      makeCoupon({ discountType: 'ABS', discount: 15 }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(15)
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps SHIPPING → FREE_SHIPPING applied to SHIPPING', () => {
    const result = transformDiscount(
      makeCoupon({ discountType: 'SHIPPING' }),
    )
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('detects PRODUCTS appliesTo when catalogLimit.products is set', () => {
    const result = transformDiscount(
      makeCoupon({ catalogLimit: { products: [100, 200] } }),
    )
    expect(result.appliesTo).toBe('PRODUCTS')
    expect(result.productIds).toEqual(['100', '200'])
  })

  it('maps catalogLimit.categories to collectionIds', () => {
    const result = transformDiscount(
      makeCoupon({ catalogLimit: { categories: [10, 20] } }),
    )
    expect(result.collectionIds).toEqual(['10', '20'])
  })

  it('preserves raw payload in metadata and produces schema-valid result', () => {
    const raw = makeCoupon()
    const result = transformDiscount(raw)
    expect(result.metadata).toBe(raw)
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformDiscount', () => {
    const canonical = transformDiscount(makeCoupon())
    const body = untransformDiscount(canonical)
    expect(body['code']).toBe('SAVE10')
    expect(body['discountType']).toBe('PERCENT')
    expect(body['discount']).toBe(10)
    expect(body['totalLimit']).toBe(100)
  })
})
