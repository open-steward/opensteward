import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawShopwarePromotion,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopware/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makePromotion(
  overrides: Partial<RawShopwarePromotion> = {},
): RawShopwarePromotion {
  return {
    id: 'promo-abc123',
    name: 'Summer Sale 20%',
    code: 'SUMMER20',
    active: true,
    validFrom: '2024-06-01T00:00:00+00:00',
    validUntil: '2024-09-01T00:00:00+00:00',
    maxRedemptionsGlobal: 1000,
    maxRedemptionsPerCustomer: 1,
    orderCount: 42,
    useCodes: true,
    discounts: [
      {
        id: 'disc-1',
        scope: 'cart',
        type: 'percentage',
        value: 20,
      },
    ],
    createdAt: '2024-05-15T10:00:00+00:00',
    updatedAt: '2024-05-20T14:00:00+00:00',
    ...overrides,
  }
}

describe('transformDiscount (Shopware)', () => {
  it('maps core fields', () => {
    const result = transformDiscount(makePromotion())
    expect(result.id).toBe('promo-abc123')
    expect(result.code).toBe('SUMMER20')
    expect(result.title).toBe('Summer Sale 20%')
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(20)
    expect(result.appliesTo).toBe('ORDER')
    expect(result.usageLimit).toBe(1000)
    expect(result.usageCount).toBe(42)
    expect(result.startsAt).toBe('2024-06-01T00:00:00+00:00')
    expect(result.endsAt).toBe('2024-09-01T00:00:00+00:00')
  })

  it('maps absolute discount type', () => {
    const result = transformDiscount(
      makePromotion({
        discounts: [{ id: 'd1', scope: 'cart', type: 'absolute', value: 10 }],
      }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
  })

  it('maps delivery scope to FREE_SHIPPING', () => {
    const result = transformDiscount(
      makePromotion({
        discounts: [{ id: 'd1', scope: 'delivery', type: 'percentage', value: 100 }],
      }),
    )
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps set scope to PRODUCTS', () => {
    const result = transformDiscount(
      makePromotion({
        discounts: [{ id: 'd1', scope: 'set', type: 'percentage', value: 15 }],
      }),
    )
    expect(result.appliesTo).toBe('PRODUCTS')
  })

  it('handles null code (automatic promotion)', () => {
    const result = transformDiscount(makePromotion({ code: null }))
    expect(result.code).toBeUndefined()
  })

  it('handles missing discounts array', () => {
    const result = transformDiscount(makePromotion({ discounts: undefined }))
    expect(result.type).toBeUndefined()
    expect(result.value).toBeUndefined()
  })

  it('preserves raw payload in metadata and validates', () => {
    const raw = makePromotion()
    const result = transformDiscount(raw)
    expect(result.metadata).toBe(raw)
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })
})

describe('untransformDiscount (Shopware)', () => {
  it('maps PERCENTAGE type', () => {
    const body = untransformDiscount({
      title: 'Test',
      code: 'TEST10',
      type: 'PERCENTAGE',
      value: 10,
    })
    expect(body['name']).toBe('Test')
    expect(body['code']).toBe('TEST10')
    expect(body['useCodes']).toBe(true)
    const discounts = body['discounts'] as Array<Record<string, unknown>>
    expect(discounts[0]!['type']).toBe('percentage')
    expect(discounts[0]!['value']).toBe(10)
  })

  it('maps FIXED_AMOUNT type', () => {
    const body = untransformDiscount({ type: 'FIXED_AMOUNT', value: 5 })
    const discounts = body['discounts'] as Array<Record<string, unknown>>
    expect(discounts[0]!['type']).toBe('absolute')
  })

  it('maps FREE_SHIPPING type', () => {
    const body = untransformDiscount({ type: 'FREE_SHIPPING' })
    const discounts = body['discounts'] as Array<Record<string, unknown>>
    expect(discounts[0]!['scope']).toBe('delivery')
  })

  it('maps SHIPPING appliesTo to delivery scope', () => {
    const body = untransformDiscount({
      type: 'PERCENTAGE',
      value: 100,
      appliesTo: 'SHIPPING',
    })
    const discounts = body['discounts'] as Array<Record<string, unknown>>
    expect(discounts[0]!['scope']).toBe('delivery')
  })

  it('maps PRODUCTS appliesTo to set scope', () => {
    const body = untransformDiscount({
      type: 'PERCENTAGE',
      value: 15,
      appliesTo: 'PRODUCTS',
    })
    const discounts = body['discounts'] as Array<Record<string, unknown>>
    expect(discounts[0]!['scope']).toBe('set')
  })
})
