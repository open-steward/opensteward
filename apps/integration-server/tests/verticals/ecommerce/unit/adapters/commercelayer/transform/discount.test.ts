import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawCLPromotion,
} from '../../../../../../../src/verticals/ecommerce/adapters/commercelayer/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makePromotion(overrides: Partial<RawCLPromotion> = {}): RawCLPromotion {
  return {
    id: 'promo-001',
    name: 'Summer Sale 20%',
    currency_code: 'USD',
    starts_at: '2024-06-01T00:00:00.000Z',
    expires_at: '2024-08-31T23:59:59.000Z',
    total_usage_limit: 1000,
    total_usage_count: 250,
    percentage: 20,
    created_at: '2024-05-15T10:00:00.000Z',
    _type: 'percentage_discount_promotions',
    ...overrides,
  }
}

describe('transformDiscount (Commerce Layer)', () => {
  it('maps core fields for a percentage promotion', () => {
    const result = transformDiscount(makePromotion())
    expect(result.id).toBe('promo-001')
    expect(result.title).toBe('Summer Sale 20%')
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(20)
    expect(result.currency).toBe('USD')
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps fixed amount promotion', () => {
    const result = transformDiscount(makePromotion({
      _type: 'fixed_amount_promotions',
      percentage: undefined,
      fixed_amount_cents: 1000,
    }))
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(1000) // already integer cents
  })

  it('maps free shipping promotion', () => {
    const result = transformDiscount(makePromotion({
      _type: 'free_shipping_promotions',
      percentage: undefined,
    }))
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps buy_x_pay_y promotion', () => {
    const result = transformDiscount(makePromotion({
      _type: 'buy_x_pay_y_promotions',
      percentage: undefined,
    }))
    expect(result.type).toBe('BUY_X_GET_Y')
    expect(result.appliesTo).toBe('PRODUCTS')
  })

  it('maps usage limits', () => {
    const result = transformDiscount(makePromotion())
    expect(result.usageLimit).toBe(1000)
    expect(result.usageCount).toBe(250)
  })

  it('maps dates', () => {
    const result = transformDiscount(makePromotion())
    expect(result.startsAt).toBe('2024-06-01T00:00:00.000Z')
    expect(result.endsAt).toBe('2024-08-31T23:59:59.000Z')
    expect(result.createdAt).toBe('2024-05-15T10:00:00.000Z')
  })

  it('handles unknown type', () => {
    const result = transformDiscount(makePromotion({ _type: 'external_promotions' }))
    expect(result.type).toBeUndefined()
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
})

describe('untransformDiscount (Commerce Layer)', () => {
  it('produces JSON:API body for percentage promotion', () => {
    const body = untransformDiscount({
      title: 'Big Sale',
      type: 'PERCENTAGE',
      value: 15,
      startsAt: '2024-01-01T00:00:00.000Z',
    }) as { data: { type: string; attributes: Record<string, unknown> } }
    expect(body.data.type).toBe('percentage_discount_promotions')
    expect(body.data.attributes['name']).toBe('Big Sale')
    expect(body.data.attributes['percentage']).toBe(15)
  })

  it('produces JSON:API body for fixed amount promotion', () => {
    const body = untransformDiscount({
      title: 'Flat Off',
      type: 'FIXED_AMOUNT',
      value: 2500,
      currency: 'EUR',
    }) as { data: { type: string; attributes: Record<string, unknown> } }
    expect(body.data.type).toBe('fixed_amount_promotions')
    expect(body.data.attributes['fixed_amount_cents']).toBe(2500)
    expect(body.data.attributes['currency_code']).toBe('EUR')
  })

  it('produces JSON:API body for free shipping promotion', () => {
    const body = untransformDiscount({
      title: 'Free Ship',
      type: 'FREE_SHIPPING',
    }) as { data: { type: string; attributes: Record<string, unknown> } }
    expect(body.data.type).toBe('free_shipping_promotions')
    expect(body.data.attributes['name']).toBe('Free Ship')
  })

  it('defaults to percentage_discount_promotions for unknown type', () => {
    const body = untransformDiscount({
      title: 'Unknown',
    }) as { data: { type: string } }
    expect(body.data.type).toBe('percentage_discount_promotions')
  })
})
