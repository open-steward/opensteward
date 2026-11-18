import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawSyliusPromotion,
} from '../../../../../../../src/verticals/ecommerce/adapters/sylius/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makePromotion(overrides: Partial<RawSyliusPromotion> = {}): RawSyliusPromotion {
  return {
    id: 50,
    code: 'summer_sale',
    name: 'Summer Sale',
    description: '20% off all orders',
    startsAt: '2024-06-01T00:00:00Z',
    endsAt: '2024-08-31T23:59:59Z',
    usageLimit: 1000,
    used: 150,
    exclusive: false,
    couponBased: true,
    priority: 0,
    coupons: [
      { id: 1, code: 'SUMMER20', used: 50 },
    ],
    actions: [
      {
        id: 1,
        type: 'order_percentage_discount',
        configuration: { percentage: 0.2 },
      },
    ],
    rules: [],
    channels: [{ code: 'DEFAULT' }],
    createdAt: '2024-05-15T10:00:00Z',
    updatedAt: '2024-06-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformDiscount (Sylius)', () => {
  it('maps core fields', () => {
    const result = transformDiscount(makePromotion())
    expect(result.id).toBe('50')
    expect(result.title).toBe('Summer Sale')
    expect(result.code).toBe('SUMMER20')
    expect(result.startsAt).toBe('2024-06-01T00:00:00Z')
    expect(result.endsAt).toBe('2024-08-31T23:59:59Z')
    expect(result.usageLimit).toBe(1000)
    expect(result.usageCount).toBe(150)
  })

  it('infers PERCENTAGE type from action type', () => {
    const result = transformDiscount(makePromotion())
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(20)
  })

  it('infers FIXED_AMOUNT type from action type with channel config', () => {
    const result = transformDiscount(
      makePromotion({
        actions: [
          {
            id: 1,
            type: 'order_fixed_discount',
            configuration: { DEFAULT: { amount: 1000 } },
          },
        ],
      }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(1000)
  })

  it('infers FIXED_AMOUNT with direct amount config', () => {
    const result = transformDiscount(
      makePromotion({
        actions: [
          { id: 1, type: 'unit_fixed_discount', configuration: { amount: 500 } },
        ],
      }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(500)
  })

  it('infers FREE_SHIPPING type', () => {
    const result = transformDiscount(
      makePromotion({
        actions: [
          { id: 1, type: 'shipping_percentage_discount', configuration: { percentage: 1.0 } },
        ],
      }),
    )
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps appliesTo PRODUCTS for unit actions', () => {
    const result = transformDiscount(
      makePromotion({
        actions: [
          { id: 1, type: 'unit_percentage_discount', configuration: { percentage: 0.1 } },
        ],
      }),
    )
    expect(result.appliesTo).toBe('PRODUCTS')
  })

  it('maps appliesTo ORDER for order-level actions', () => {
    const result = transformDiscount(makePromotion())
    expect(result.appliesTo).toBe('ORDER')
  })

  it('falls back to promotion code when no coupons', () => {
    const result = transformDiscount(makePromotion({ coupons: undefined }))
    expect(result.code).toBe('summer_sale')
  })

  it('handles no actions gracefully', () => {
    const result = transformDiscount(makePromotion({ actions: undefined }))
    expect(result.type).toBeUndefined()
    expect(result.value).toBeUndefined()
  })

  it('preserves metadata', () => {
    const raw = makePromotion()
    const result = transformDiscount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('satisfies DiscountSchema', () => {
    const result = transformDiscount(makePromotion())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformDiscount', () => {
    const canonical = transformDiscount(makePromotion())
    const body = untransformDiscount(canonical)
    expect(body['code']).toBe('SUMMER20')
    expect(body['name']).toBe('Summer Sale')
    expect(body['startsAt']).toBe('2024-06-01T00:00:00Z')
    expect(body['endsAt']).toBe('2024-08-31T23:59:59Z')
    expect(body['usageLimit']).toBe(1000)
  })
})
