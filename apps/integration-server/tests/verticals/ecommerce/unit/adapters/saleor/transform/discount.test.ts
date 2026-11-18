import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawSaleorVoucher,
} from '../../../../../../../src/verticals/ecommerce/adapters/saleor/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeVoucher(overrides: Partial<RawSaleorVoucher> = {}): RawSaleorVoucher {
  return {
    id: 'Vm91Y2hlcjox',
    name: 'Summer 10% Off',
    code: 'SUMMER10',
    discountValueType: 'PERCENTAGE',
    discountValue: 10,
    currency: 'USD',
    type: 'ENTIRE_ORDER',
    applyOncePerOrder: true,
    usageLimit: 100,
    used: 42,
    startDate: '2024-06-01T00:00:00Z',
    endDate: '2024-08-31T23:59:59Z',
    minSpent: { amount: 50, currency: 'USD' },
    products: { edges: [{ node: { id: 'P1' } }], pageInfo: { hasNextPage: false } },
    collections: { edges: [], pageInfo: { hasNextPage: false } },
    ...overrides,
  }
}

describe('transformDiscount (Saleor)', () => {
  it('maps core fields', () => {
    const result = transformDiscount(makeVoucher())
    expect(result.id).toBe('Vm91Y2hlcjox')
    expect(result.code).toBe('SUMMER10')
    expect(result.title).toBe('Summer 10% Off')
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
    expect(result.appliesTo).toBe('ORDER')
    expect(result.usageLimit).toBe(100)
    expect(result.usageCount).toBe(42)
    expect(result.startsAt).toBe('2024-06-01T00:00:00Z')
    expect(result.productIds).toEqual(['P1'])
    expect(result.collectionIds).toBeUndefined()
    // Voucher has no creation timestamp
    expect(result.createdAt).toBeUndefined()
  })

  it('does not serve a truncated product id list as complete', () => {
    const result = transformDiscount(
      makeVoucher({
        products: { edges: [{ node: { id: 'P1' } }], pageInfo: { hasNextPage: true } },
      }),
    )
    expect(result.productIds).toBeUndefined()
  })

  it('takes the minimum spend currency from minSpent, with no default', () => {
    const result = transformDiscount(makeVoucher({ minSpent: { amount: 500, currency: 'JPY' } }))
    expect(result.minimumPurchaseAmount).toEqual({ amount: 500, currency: 'JPY' })
    expect(transformDiscount(makeVoucher({ minSpent: null })).minimumPurchaseAmount).toBeUndefined()
  })

  it('maps FIXED discount type', () => {
    const result = transformDiscount(makeVoucher({ discountValueType: 'FIXED' }))
    expect(result.type).toBe('FIXED_AMOUNT')
  })

  it('maps a SHIPPING voucher by its value type, applied to shipping', () => {
    const pct = transformDiscount(
      makeVoucher({ type: 'SHIPPING', discountValueType: 'PERCENTAGE' }),
    )
    expect(pct.type).toBe('PERCENTAGE')
    expect(pct.value).toBe(10)
    expect(pct.appliesTo).toBe('SHIPPING')
    const fixed = transformDiscount(makeVoucher({ type: 'SHIPPING', discountValueType: 'FIXED' }))
    expect(fixed.type).toBe('FIXED_AMOUNT')
    expect(fixed.appliesTo).toBe('SHIPPING')
  })

  it('maps minimum purchase amount', () => {
    const result = transformDiscount(makeVoucher())
    expect(result.minimumPurchaseAmount).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeVoucher()
    const result = transformDiscount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    const result = transformDiscount(makeVoucher())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformDiscount', () => {
    const canonical = transformDiscount(makeVoucher())
    const raw = untransformDiscount(canonical)
    expect(raw['name']).toBe('Summer 10% Off')
    expect(raw['code']).toBe('SUMMER10')
    expect(raw['discountValueType']).toBe('PERCENTAGE')
    expect(raw['discountValue']).toBe(10)
  })
})
