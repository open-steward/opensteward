import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawSpreePromotion,
} from '../../../../../../../src/verticals/ecommerce/adapters/spree/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makePromotion(overrides: Partial<RawSpreePromotion> = {}): RawSpreePromotion {
  return {
    id: 50,
    name: 'Summer Sale',
    description: '20% off all orders',
    code: 'SUMMER20',
    starts_at: '2024-06-01T00:00:00.000Z',
    expires_at: '2024-08-31T23:59:59.000Z',
    usage_limit: 1000,
    usage_count: 150,
    match_policy: 'all',
    advertise: true,
    apply_automatically: false,
    promotion_codes: [
      { id: 1, value: 'SUMMER20', promotion_id: 50 },
    ],
    promotion_actions: [
      {
        id: 1,
        type: 'Spree::Promotion::Actions::CreateAdjustment',
        amount: '20',
        calculator_type: 'Spree::Calculator::PercentOnLineItem',
      },
    ],
    promotion_rules: [
      {
        id: 1,
        type: 'Spree::Promotion::Rules::Product',
        product_ids: [42, 43],
        taxon_ids: [5],
      },
    ],
    created_at: '2024-05-15T10:00:00.000Z',
    updated_at: '2024-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformDiscount (Spree)', () => {
  it('maps core fields', () => {
    const result = transformDiscount(makePromotion())
    expect(result.id).toBe('50')
    expect(result.title).toBe('Summer Sale')
    expect(result.code).toBe('SUMMER20')
    expect(result.startsAt).toBe('2024-06-01T00:00:00.000Z')
    expect(result.endsAt).toBe('2024-08-31T23:59:59.000Z')
    expect(result.usageLimit).toBe(1000)
    expect(result.usageCount).toBe(150)
  })

  it('infers PERCENTAGE type from calculator', () => {
    const result = transformDiscount(makePromotion())
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(20)
  })

  it('infers FIXED_AMOUNT type from FlatRate calculator', () => {
    const result = transformDiscount(
      makePromotion({
        promotion_actions: [
          { id: 1, type: 'CreateAdjustment', amount: '10', calculator_type: 'FlatRate' },
        ],
      }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(10)
  })

  it('infers FREE_SHIPPING type', () => {
    const result = transformDiscount(
      makePromotion({
        promotion_actions: [
          { id: 1, type: 'Spree::Promotion::Actions::FreeShipping' },
        ],
      }),
    )
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps product IDs from rules', () => {
    const result = transformDiscount(makePromotion())
    expect(result.productIds).toEqual(['42', '43'])
  })

  it('maps collection IDs from taxon rules', () => {
    const result = transformDiscount(makePromotion())
    expect(result.collectionIds).toEqual(['5'])
  })

  it('maps appliesTo PRODUCTS when product rules present', () => {
    const result = transformDiscount(makePromotion())
    expect(result.appliesTo).toBe('PRODUCTS')
  })

  it('maps appliesTo ORDER when no product rules', () => {
    const result = transformDiscount(makePromotion({ promotion_rules: [] }))
    expect(result.appliesTo).toBe('ORDER')
  })

  it('falls back to promotion_codes for code', () => {
    const result = transformDiscount(makePromotion({ code: null }))
    expect(result.code).toBe('SUMMER20')
  })

  it('handles no actions gracefully', () => {
    const result = transformDiscount(makePromotion({ promotion_actions: undefined }))
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
    const body = untransformDiscount(canonical) as { promotion: Record<string, unknown> }
    expect(body.promotion['name']).toBe('Summer Sale')
    expect(body.promotion['code']).toBe('SUMMER20')
    expect(body.promotion['starts_at']).toBe('2024-06-01T00:00:00.000Z')
    expect(body.promotion['expires_at']).toBe('2024-08-31T23:59:59.000Z')
    expect(body.promotion['usage_limit']).toBe(1000)
  })
})
