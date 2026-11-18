import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawMedusaPromotion,
} from '../../../../../../../src/verticals/ecommerce/adapters/medusa/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makePromotion(overrides: Partial<RawMedusaPromotion> = {}): RawMedusaPromotion {
  return {
    id: 'promo_01',
    code: 'SUMMER20',
    type: 'standard',
    is_automatic: false,
    application_method: {
      type: 'percentage',
      value: 20,
      target_type: 'order',
      currency_code: 'USD',
    },
    created_at: '2024-01-10T12:00:00Z',
    updated_at: '2024-02-01T09:00:00Z',
    ...overrides,
  }
}

describe('transformDiscount (Medusa v2)', () => {
  it('maps percentage promotion', () => {
    const result = transformDiscount(makePromotion())
    expect(result.id).toBe('promo_01')
    expect(result.code).toBe('SUMMER20')
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(20)
    expect(result.appliesTo).toBe('ORDER')
    expect(result.currency).toBe('USD')
  })

  it('maps fixed amount promotion and converts cents', () => {
    const result = transformDiscount(
      makePromotion({
        application_method: {
          type: 'fixed',
          value: 1000,
          target_type: 'items',
          currency_code: 'USD',
        },
      }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(1000)
    expect(result.appliesTo).toBe('PRODUCTS')
  })

  it('maps free shipping promotion', () => {
    const result = transformDiscount(
      makePromotion({
        application_method: {
          type: 'fixed',
          value: 0,
          target_type: 'shipping_methods',
        },
      }),
    )
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps buyget promotion', () => {
    const result = transformDiscount(
      makePromotion({ type: 'buyget', application_method: null }),
    )
    expect(result.type).toBe('BUY_X_GET_Y')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makePromotion()
    const result = transformDiscount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformDiscount(makePromotion())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('round-trips percentage discount via untransformDiscount', () => {
    const body = untransformDiscount({
      code: 'SAVE10',
      type: 'PERCENTAGE',
      value: 10,
      appliesTo: 'ORDER',
      currency: 'USD',
    })
    expect(body['code']).toBe('SAVE10')
    expect(body['type']).toBe('standard')
    const method = body['application_method'] as Record<string, unknown>
    expect(method['type']).toBe('percentage')
    expect(method['value']).toBe(10)
    expect(method['target_type']).toBe('order')
  })

  it('untransforms fixed amount back to cents', () => {
    const body = untransformDiscount({
      type: 'FIXED_AMOUNT',
      value: 1500,
      appliesTo: 'PRODUCTS',
    })
    const method = body['application_method'] as Record<string, unknown>
    expect(method['type']).toBe('fixed')
    expect(method['value']).toBe(1500) // $15 → 1500 cents
    expect(method['target_type']).toBe('items')
  })

  it('untransforms free shipping', () => {
    const body = untransformDiscount({ type: 'FREE_SHIPPING' })
    const method = body['application_method'] as Record<string, unknown>
    expect(method['target_type']).toBe('shipping_methods')
    expect(method['value']).toBe(0)
  })
})
