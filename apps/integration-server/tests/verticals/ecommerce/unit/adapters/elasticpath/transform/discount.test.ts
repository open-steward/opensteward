import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawEpPromotion,
} from '../../../../../../../src/verticals/ecommerce/adapters/elasticpath/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makePromotion(overrides: Partial<RawEpPromotion> = {}): RawEpPromotion {
  return {
    id: 'promo-001',
    type: 'promotion',
    name: '20% Off Summer Sale',
    description: 'Get 20% off all summer items.',
    enabled: true,
    promotion_type: 'percent_discount',
    schema: {
      percentage: 20,
    },
    start: '2024-06-01T00:00:00.000Z',
    end: '2024-09-01T00:00:00.000Z',
    created_at: '2024-05-15T10:00:00.000Z',
    min_cart_value: [{ currency: 'USD', amount: 5000 }],
    ...overrides,
  }
}

describe('transformDiscount (Elastic Path)', () => {
  it('maps core fields for percent discount', () => {
    const result = transformDiscount(makePromotion())
    expect(result.id).toBe('promo-001')
    expect(result.title).toBe('20% Off Summer Sale')
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(20)
    expect(result.appliesTo).toBe('PRODUCTS')
    expect(result.startsAt).toBe('2024-06-01T00:00:00.000Z')
    expect(result.endsAt).toBe('2024-09-01T00:00:00.000Z')
    expect(result.createdAt).toBe('2024-05-15T10:00:00.000Z')
  })

  it('maps minimum purchase amount from cents', () => {
    const result = transformDiscount(makePromotion())
    expect(result.minimumPurchaseAmount).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('maps fixed discount from schema currencies', () => {
    const result = transformDiscount(
      makePromotion({
        promotion_type: 'fixed_discount',
        schema: { currencies: [{ currency: 'USD', amount: 1500 }] },
      }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(1500)
    expect(result.currency).toBe('USD')
  })

  it('maps free_shipping type', () => {
    const result = transformDiscount(
      makePromotion({ promotion_type: 'free_shipping', schema: {} }),
    )
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps x_for_y type to BUY_X_GET_Y', () => {
    const result = transformDiscount(
      makePromotion({ promotion_type: 'x_for_y', schema: {} }),
    )
    expect(result.type).toBe('BUY_X_GET_Y')
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

describe('untransformDiscount (Elastic Path)', () => {
  it('round-trips writable fields', () => {
    const body = untransformDiscount({
      title: 'Summer Sale',
      type: 'PERCENTAGE',
      startsAt: '2024-06-01T00:00:00.000Z',
      endsAt: '2024-09-01T00:00:00.000Z',
    }) as { data: Record<string, unknown> }
    expect(body.data['type']).toBe('promotion')
    expect(body.data['name']).toBe('Summer Sale')
    expect(body.data['promotion_type']).toBe('percent_discount')
    expect(body.data['enabled']).toBe(true)
  })

  it('maps FIXED_AMOUNT to fixed_discount', () => {
    const body = untransformDiscount({ type: 'FIXED_AMOUNT' }) as { data: Record<string, unknown> }
    expect(body.data['promotion_type']).toBe('fixed_discount')
  })

  it('maps FREE_SHIPPING to free_shipping', () => {
    const body = untransformDiscount({ type: 'FREE_SHIPPING' }) as { data: Record<string, unknown> }
    expect(body.data['promotion_type']).toBe('free_shipping')
  })
})
