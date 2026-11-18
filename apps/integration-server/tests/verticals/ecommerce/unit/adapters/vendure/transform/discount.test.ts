import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawVendurePromotion,
} from '../../../../../../../src/verticals/ecommerce/adapters/vendure/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makePromotion(overrides: Partial<RawVendurePromotion> = {}): RawVendurePromotion {
  return {
    id: 'PROMO1',
    name: 'Summer 20% Off',
    couponCode: 'SUMMER20',
    enabled: true,
    startsAt: '2024-06-01T00:00:00Z',
    endsAt: '2024-08-31T23:59:59Z',
    perCustomerUsageLimit: 1,
    usageLimit: 100,
    conditions: [
      { code: 'minimum_order_amount', args: [{ name: 'amount', value: '5000' }] },
    ],
    actions: [
      { code: 'order_percentage_discount', args: [{ name: 'discount', value: '20' }] },
    ],
    createdAt: '2024-05-15T10:00:00Z',
    updatedAt: '2024-05-15T10:00:00Z',
    ...overrides,
  }
}

describe('transformDiscount (Vendure)', () => {
  it('maps core fields', () => {
    const result = transformDiscount(makePromotion())
    expect(result.id).toBe('PROMO1')
    expect(result.title).toBe('Summer 20% Off')
    expect(result.code).toBe('SUMMER20')
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(20)
    expect(result.startsAt).toBe('2024-06-01T00:00:00Z')
    expect(result.endsAt).toBe('2024-08-31T23:59:59Z')
  })

  it('maps fixed amount discount', () => {
    const result = transformDiscount(makePromotion({
      actions: [{ code: 'order_fixed_discount', args: [{ name: 'discount', value: '10' }] }],
    }))
    expect(result.type).toBe('FIXED_AMOUNT')
  })

  it('maps free shipping discount', () => {
    const result = transformDiscount(makePromotion({
      actions: [{ code: 'free_shipping', args: [] }],
    }))
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps usage limits', () => {
    const result = transformDiscount(makePromotion())
    expect(result.usageLimit).toBe(100)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makePromotion()
    const result = transformDiscount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    const result = transformDiscount(makePromotion())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformDiscount', () => {
    const canonical = transformDiscount(makePromotion())
    const raw = untransformDiscount(canonical)
    expect(raw['name']).toBe('Summer 20% Off')
    expect(raw['couponCode']).toBe('SUMMER20')
    expect(raw['enabled']).toBe(true)
    expect(raw['startsAt']).toBe('2024-06-01T00:00:00Z')
  })
})
