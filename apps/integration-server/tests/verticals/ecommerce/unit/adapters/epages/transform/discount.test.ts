/**
 * ePages Beyond coupon campaign ↔ canonical Discount.
 * Docs: coupon-campaigns CRUD (see module doc comment for the exact evidence trail).
 */
import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawEpagesCouponCampaign,
} from '../../../../../../../src/verticals/ecommerce/adapters/epages/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeCampaign(overrides: Partial<RawEpagesCouponCampaign> = {}): RawEpagesCouponCampaign {
  return {
    _id: 'camp1',
    name: 'Summer Sale',
    start: '2026-06-01T00:00:00.000',
    end: '2026-06-30T23:59:59.000',
    discounts: [{ type: 'CART', value: { type: 'PERCENT', percentageValue: 20 } }],
    maxNumberOfRedemptions: 100,
    numberOfRedemptions: 3,
    ...overrides,
  }
}

describe('transformDiscount (ePages Beyond)', () => {
  it('maps core fields', () => {
    const result = transformDiscount(makeCampaign())
    expect(result.id).toBe('camp1')
    expect(result.title).toBe('Summer Sale')
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(20)
    expect(result.appliesTo).toBe('ORDER')
    expect(result.usageLimit).toBe(100)
    expect(result.usageCount).toBe(3)
  })

  it('maps a PRODUCT-scoped absolute discount', () => {
    const result = transformDiscount(
      makeCampaign({
        discounts: [
          { type: 'PRODUCT', value: { type: 'ABSOLUTE', absoluteValue: { amount: 5, currency: 'EUR' } } },
        ],
      }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.appliesTo).toBe('PRODUCTS')
    expect(result.value).toBe(5)
    expect(result.currency).toBe('EUR')
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeCampaign()
    expect(transformDiscount(raw).metadata).toBe(raw)
  })

  it('satisfies DiscountSchema', () => {
    expect(() => DiscountSchema.parse(transformDiscount(makeCampaign()))).not.toThrow()
  })
})

describe('untransformDiscount (ePages Beyond)', () => {
  it('requires title and value', () => {
    expect(() => untransformDiscount({})).toThrow(/requires `title`/)
    expect(() => untransformDiscount({ title: 'X' })).toThrow(/requires `value`/)
  })

  it('builds a PERCENT create body', () => {
    const body = untransformDiscount({ title: 'X', value: 15 }) as Record<string, unknown>
    expect(body.name).toBe('X')
    expect(body.discounts).toEqual([{ type: 'CART', value: { type: 'PERCENT', percentageValue: 15 } }])
  })

  it('builds an ABSOLUTE create body for FIXED_AMOUNT', () => {
    const body = untransformDiscount({
      title: 'X',
      type: 'FIXED_AMOUNT',
      value: 5,
      currency: 'EUR',
      appliesTo: 'PRODUCTS',
    }) as Record<string, unknown>
    expect(body.discounts).toEqual([
      { type: 'PRODUCT', value: { type: 'ABSOLUTE', absoluteValue: { amount: 5, currency: 'EUR' } } },
    ])
  })
})
