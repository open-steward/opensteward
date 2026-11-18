import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawSapPromotion,
  type RawSapCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/sap-commerce/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makePromotion(overrides: Partial<RawSapPromotion> = {}): RawSapPromotion {
  return {
    code: 'PROMO-SUMMER',
    title: 'Summer Sale',
    description: '20% off all electronics',
    promotionType: 'productPromotion',
    startDate: '2024-06-01T00:00:00.000Z',
    endDate: '2024-08-31T23:59:59.000Z',
    enabled: true,
    priority: 10,
    ...overrides,
  }
}

function makeCoupon(): RawSapCoupon {
  return {
    couponId: 'SUMMER20',
    name: 'Summer 20% Coupon',
    startDate: '2024-06-01T00:00:00.000Z',
    endDate: '2024-08-31T23:59:59.000Z',
    active: true,
    maxTotalRedemptions: 1000,
    maxRedemptionsPerCustomer: 1,
  }
}

describe('transformDiscount (sap-commerce)', () => {
  it('maps core fields', () => {
    const r = transformDiscount(makePromotion())
    expect(r.id).toBe('PROMO-SUMMER')
    expect(r.title).toBe('Summer Sale')
  })

  it('maps discount type from description', () => {
    expect(transformDiscount(makePromotion({ description: '20% off' })).type).toBe('PERCENTAGE')
    expect(transformDiscount(makePromotion({ description: 'Free shipping on orders' })).type).toBe('FREE_SHIPPING')
    expect(transformDiscount(makePromotion({ description: 'Buy 2 get 1 free' })).type).toBe('BUY_X_GET_Y')
  })

  it('maps appliesTo from promotionType', () => {
    expect(transformDiscount(makePromotion({ promotionType: 'productPromotion' })).appliesTo).toBe('PRODUCTS')
    expect(transformDiscount(makePromotion({ promotionType: 'orderPromotion' })).appliesTo).toBe('ORDER')
  })

  it('maps coupon code when provided', () => {
    const r = transformDiscount(makePromotion(), makeCoupon())
    expect(r.code).toBe('SUMMER20')
    expect(r.usageLimit).toBe(1000)
  })

  it('maps date range', () => {
    const r = transformDiscount(makePromotion())
    expect(r.startsAt).toBe('2024-06-01T00:00:00.000Z')
    expect(r.endsAt).toBe('2024-08-31T23:59:59.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makePromotion()
    const r = transformDiscount(raw)
    expect(r.metadata).toBe(raw)
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    const r = transformDiscount(makePromotion())
    expect(() => DiscountSchema.parse(r)).not.toThrow()
  })
})

describe('untransformDiscount (sap-commerce)', () => {
  it('builds promotion body', () => {
    const body = untransformDiscount({
      id: 'NEW-PROMO',
      title: 'New Promotion',
      startsAt: '2024-01-01T00:00:00.000Z',
    }) as Record<string, unknown>
    expect(body['code']).toBe('NEW-PROMO')
    expect(body['title']).toBe('New Promotion')
    expect(body['enabled']).toBe(true)
  })
})
