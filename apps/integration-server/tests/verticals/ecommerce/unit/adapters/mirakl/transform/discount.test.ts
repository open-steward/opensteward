import { describe, it, expect } from 'vitest'
import {
  transformPromotion,
  type RawMiraklPromotion,
} from '../../../../../../../src/verticals/ecommerce/adapters/mirakl/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeRaw(overrides: Partial<RawMiraklPromotion> = {}): RawMiraklPromotion {
  return {
    internal_id: 'PROMO-1',
    internal_description: 'Summer Sale 10% Off',
    type: 'PERCENTAGE_OFF',
    state: 'ACTIVE',
    percentage_off: 10,
    start_date: '2024-03-01T00:00:00Z',
    end_date: '2024-03-31T00:00:00Z',
    date_created: '2024-02-15T00:00:00Z',
    ...overrides,
  }
}

describe('transformPromotion (Mirakl)', () => {
  it('maps internal_id to canonical id', () => {
    const result = transformPromotion(makeRaw())
    expect(result.id).toBe('PROMO-1')
  })

  it('maps internal_description to title', () => {
    const result = transformPromotion(makeRaw())
    expect(result.title).toBe('Summer Sale 10% Off')
  })

  it('maps PERCENTAGE_OFF to PERCENTAGE type', () => {
    const result = transformPromotion(makeRaw())
    expect(result.type).toBe('PERCENTAGE')
  })

  it('maps AMOUNT_OFF to FIXED_AMOUNT type', () => {
    const result = transformPromotion(
      makeRaw({ type: 'AMOUNT_OFF', amount_off: 500, percentage_off: null }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
  })

  it('maps FREE_ITEMS to BUY_X_GET_Y type', () => {
    const result = transformPromotion(
      makeRaw({ type: 'FREE_ITEMS', free_items_quantity: 1, percentage_off: null }),
    )
    expect(result.type).toBe('BUY_X_GET_Y')
  })

  it('maps REDUCED_UNIT_PRICE to FIXED_AMOUNT type', () => {
    const result = transformPromotion(
      makeRaw({ type: 'REDUCED_UNIT_PRICE', reduced_unit_price: 999, percentage_off: null }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
  })

  it('picks percentage_off as value for PERCENTAGE_OFF', () => {
    const result = transformPromotion(makeRaw())
    expect(result.value).toBe(10)
  })

  it('picks amount_off as value for AMOUNT_OFF', () => {
    const result = transformPromotion(
      makeRaw({ type: 'AMOUNT_OFF', amount_off: 500, percentage_off: null }),
    )
    expect(result.value).toBe(500)
  })

  it('maps to ORDER when no offer IDs are present', () => {
    const result = transformPromotion(makeRaw())
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps to PRODUCTS when trigger_offer_ids are present', () => {
    const result = transformPromotion(makeRaw({ trigger_offer_ids: ['OFF-1', 'OFF-2'] }))
    expect(result.appliesTo).toBe('PRODUCTS')
    expect(result.productIds).toEqual(['OFF-1', 'OFF-2'])
  })

  it('extracts promo code from application_to_cart', () => {
    const result = transformPromotion(
      makeRaw({ application_to_cart: [{ promo_code: 'SUMMER10' }] }),
    )
    expect(result.code).toBe('SUMMER10')
  })

  it('maps date fields to ISO strings', () => {
    const result = transformPromotion(makeRaw())
    expect(result.startsAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.endsAt).toBe('2024-03-31T00:00:00.000Z')
    expect(result.createdAt).toBe('2024-02-15T00:00:00.000Z')
  })

  it('deduplicates productIds from trigger and reward offer ids', () => {
    const result = transformPromotion(
      makeRaw({ trigger_offer_ids: ['OFF-1'], reward_offer_ids: ['OFF-1', 'OFF-2'] }),
    )
    expect(result.productIds).toEqual(['OFF-1', 'OFF-2'])
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    const result = transformPromotion(makeRaw())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })
})
