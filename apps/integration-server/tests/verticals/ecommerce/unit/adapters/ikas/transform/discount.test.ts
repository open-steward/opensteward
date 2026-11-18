import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawIkasCampaign,
} from '../../../../../../../src/verticals/ecommerce/adapters/ikas/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeCampaign(overrides: Partial<RawIkasCampaign> = {}): RawIkasCampaign {
  return {
    id: 'camp-001',
    title: 'Summer Sale',
    couponCode: 'SUMMER20',
    discountType: 'PERCENTAGE',
    discountValue: 20,
    minimumOrderAmount: 100,
    usageLimit: 500,
    usageCount: 10,
    appliesTo: 'ALL',
    startsAt: '2024-06-01T00:00:00Z',
    endsAt: '2024-08-31T00:00:00Z',
    isActive: true,
    createdAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformDiscount (ikas)', () => {
  it('maps id, code, title', () => {
    const result = transformDiscount(makeCampaign())
    expect(result.id).toBe('camp-001')
    expect(result.code).toBe('SUMMER20')
    expect(result.title).toBe('Summer Sale')
  })

  it('maps PERCENTAGE type and keeps value as-is', () => {
    const result = transformDiscount(makeCampaign())
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(20)
  })

  it('maps FIXED_AMOUNT type and converts to minor units (TRY)', () => {
    const result = transformDiscount(
      makeCampaign({ discountType: 'FIXED_AMOUNT', discountValue: 50 }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    // 50 TRY → 5000 minor units
    expect(result.value).toBe(5000)
  })

  it('maps FREE_SHIPPING type', () => {
    const result = transformDiscount(
      makeCampaign({ discountType: 'FREE_SHIPPING', discountValue: 0 }),
    )
    expect(result.type).toBe('FREE_SHIPPING')
  })

  it('maps appliesTo ALL → ORDER', () => {
    const result = transformDiscount(makeCampaign())
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps SPECIFIC_PRODUCTS → PRODUCTS', () => {
    const result = transformDiscount(
      makeCampaign({ appliesTo: 'SPECIFIC_PRODUCTS', productIds: ['p1', 'p2'] }),
    )
    expect(result.appliesTo).toBe('PRODUCTS')
    expect(result.productIds).toEqual(['p1', 'p2'])
  })

  it('maps minimumOrderAmount to minor units', () => {
    const result = transformDiscount(makeCampaign())
    // 100 TRY → 10000 minor units
    expect(result.minimumPurchaseAmount).toEqual({ amount: 10000, currency: 'TRY' })
  })

  it('omits minimumPurchaseAmount when 0', () => {
    const result = transformDiscount(makeCampaign({ minimumOrderAmount: 0 }))
    expect(result.minimumPurchaseAmount).toBeUndefined()
  })

  it('maps usageLimit, usageCount, startsAt, endsAt, createdAt', () => {
    const result = transformDiscount(makeCampaign())
    expect(result.usageLimit).toBe(500)
    expect(result.usageCount).toBe(10)
    expect(result.startsAt).toBe('2024-06-01T00:00:00Z')
    expect(result.endsAt).toBe('2024-08-31T00:00:00Z')
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
  })

  it('always sets customerEligibility to ALL', () => {
    const result = transformDiscount(makeCampaign())
    expect(result.customerEligibility).toBe('ALL')
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeCampaign()
    const result = transformDiscount(raw)
    expect(result.metadata).toBe(raw)
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformDiscount', () => {
    const canonical = transformDiscount(makeCampaign())
    const body = untransformDiscount(canonical)
    expect(body['couponCode']).toBe('SUMMER20')
    expect(body['discountType']).toBe('PERCENTAGE')
  })
})
