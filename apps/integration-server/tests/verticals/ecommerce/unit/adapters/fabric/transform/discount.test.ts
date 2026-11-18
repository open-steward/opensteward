import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawFabricPromotion,
} from '../../../../../../../src/verticals/ecommerce/adapters/fabric/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makePromotion(overrides: Partial<RawFabricPromotion> = {}): RawFabricPromotion {
  return {
    id: 'promo-001',
    code: 'SUMMER20',
    title: '20% Summer Sale',
    type: 'percentage',
    value: 20,
    currency: 'USD',
    applies_to: 'order',
    product_ids: [],
    collection_ids: [],
    minimum_purchase_amount: 50.00,
    minimum_purchase_currency: 'USD',
    usage_limit: 1000,
    usage_count: 150,
    customer_eligibility: 'all',
    starts_at: '2024-06-01T00:00:00Z',
    ends_at: '2024-08-31T23:59:59Z',
    created_at: '2024-05-15T10:00:00Z',
    ...overrides,
  }
}

describe('transformDiscount (fabric)', () => {
  it('maps core fields', () => {
    const result = transformDiscount(makePromotion())
    expect(result.id).toBe('promo-001')
    expect(result.code).toBe('SUMMER20')
    expect(result.title).toBe('20% Summer Sale')
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(20)
    expect(result.currency).toBe('USD')
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps type values', () => {
    expect(transformDiscount(makePromotion({ type: 'percentage' })).type).toBe('PERCENTAGE')
    expect(transformDiscount(makePromotion({ type: 'fixed_amount' })).type).toBe('FIXED_AMOUNT')
    expect(transformDiscount(makePromotion({ type: 'free_shipping' })).type).toBe('FREE_SHIPPING')
    expect(transformDiscount(makePromotion({ type: 'buy_x_get_y' })).type).toBe('BUY_X_GET_Y')
  })

  it('maps appliesTo values', () => {
    expect(transformDiscount(makePromotion({ applies_to: 'order' })).appliesTo).toBe('ORDER')
    expect(transformDiscount(makePromotion({ applies_to: 'products' })).appliesTo).toBe('PRODUCTS')
    expect(transformDiscount(makePromotion({ applies_to: 'shipping' })).appliesTo).toBe('SHIPPING')
  })

  it('maps minimum purchase amount', () => {
    const result = transformDiscount(makePromotion())
    expect(result.minimumPurchaseAmount).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('handles missing minimum purchase', () => {
    const result = transformDiscount(makePromotion({ minimum_purchase_amount: undefined }))
    expect(result.minimumPurchaseAmount).toBeUndefined()
  })

  it('maps customer eligibility', () => {
    expect(transformDiscount(makePromotion({ customer_eligibility: 'all' })).customerEligibility).toBe('ALL')
    expect(transformDiscount(makePromotion({ customer_eligibility: 'specific' })).customerEligibility).toBe('SPECIFIC')
  })

  it('maps usage tracking', () => {
    const result = transformDiscount(makePromotion())
    expect(result.usageLimit).toBe(1000)
    expect(result.usageCount).toBe(150)
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makePromotion()
    const result = transformDiscount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    const result = transformDiscount(makePromotion())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })
})

describe('untransformDiscount (fabric)', () => {
  it('round-trips writable fields', () => {
    const canonical = transformDiscount(makePromotion())
    const body = untransformDiscount(canonical) as Record<string, unknown>
    expect(body['code']).toBe('SUMMER20')
    expect(body['title']).toBe('20% Summer Sale')
    expect(body['type']).toBe('percentage')
    expect(body['value']).toBe(20)
    expect(body['applies_to']).toBe('order')
  })

  it('maps discount types back', () => {
    expect((untransformDiscount({ type: 'FREE_SHIPPING' }) as Record<string, unknown>)['type']).toBe('free_shipping')
    expect((untransformDiscount({ type: 'BUY_X_GET_Y' }) as Record<string, unknown>)['type']).toBe('buy_x_get_y')
  })
})
