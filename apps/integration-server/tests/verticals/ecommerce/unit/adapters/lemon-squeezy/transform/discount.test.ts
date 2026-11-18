import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawLsDiscount,
  type RawLsDiscountAttributes,
} from '../../../../../../../src/verticals/ecommerce/adapters/lemon-squeezy/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeAttrs(overrides: Partial<RawLsDiscountAttributes> = {}): RawLsDiscountAttributes {
  return {
    store_id: 1,
    name: 'Summer Sale',
    code: 'SUMMER10',
    amount: 10,
    amount_type: 'percent',
    is_limited_to_products: false,
    is_limited_redemptions: true,
    max_redemptions: 100,
    starts_at: '2024-03-01T00:00:00Z',
    expires_at: '2024-08-31T23:59:59Z',
    duration: 'once',
    duration_in_months: 0,
    status: 'published',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

function makeRaw(attrsOverrides: Partial<RawLsDiscountAttributes> = {}): RawLsDiscount {
  return {
    id: 'disc-77',
    type: 'discounts',
    attributes: makeAttrs(attrsOverrides),
  }
}

describe('transformDiscount (lemon-squeezy)', () => {
  it('maps raw.id to id', () => {
    const result = transformDiscount(makeRaw())
    expect(result.id).toBe('disc-77')
  })

  it('maps code', () => {
    const result = transformDiscount(makeRaw())
    expect(result.code).toBe('SUMMER10')
  })

  it('maps name to title', () => {
    const result = transformDiscount(makeRaw())
    expect(result.title).toBe('Summer Sale')
  })

  it('maps percent amount_type to PERCENTAGE', () => {
    const result = transformDiscount(makeRaw({ amount_type: 'percent' }))
    expect(result.type).toBe('PERCENTAGE')
  })

  it('maps fixed amount_type to FIXED_AMOUNT', () => {
    const result = transformDiscount(makeRaw({ amount_type: 'fixed', amount: 500 }))
    expect(result.type).toBe('FIXED_AMOUNT')
  })

  it('uses amount as value for PERCENTAGE type (0-100)', () => {
    const result = transformDiscount(makeRaw({ amount_type: 'percent', amount: 15 }))
    expect(result.value).toBe(15)
  })

  it('uses amount as value for FIXED_AMOUNT (already cents)', () => {
    const result = transformDiscount(makeRaw({ amount_type: 'fixed', amount: 999 }))
    expect(result.value).toBe(999)
  })

  it('maps is_limited_to_products false to ORDER appliesTo', () => {
    const result = transformDiscount(makeRaw({ is_limited_to_products: false }))
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps is_limited_to_products true to PRODUCTS appliesTo', () => {
    const result = transformDiscount(makeRaw({ is_limited_to_products: true }))
    expect(result.appliesTo).toBe('PRODUCTS')
  })

  it('maps is_limited_redemptions + max_redemptions to usageLimit', () => {
    const result = transformDiscount(makeRaw({ is_limited_redemptions: true, max_redemptions: 50 }))
    expect(result.usageLimit).toBe(50)
  })

  it('sets usageLimit to undefined when is_limited_redemptions is false', () => {
    const result = transformDiscount(
      makeRaw({ is_limited_redemptions: false, max_redemptions: 100 }),
    )
    expect(result.usageLimit).toBeUndefined()
  })

  it('maps starts_at to startsAt', () => {
    const result = transformDiscount(makeRaw())
    expect(result.startsAt).toBe('2024-03-01T00:00:00Z')
  })

  it('maps expires_at to endsAt', () => {
    const result = transformDiscount(makeRaw())
    expect(result.endsAt).toBe('2024-08-31T23:59:59Z')
  })

  it('maps created_at to createdAt', () => {
    const result = transformDiscount(makeRaw())
    expect(result.createdAt).toBe('2024-01-01T00:00:00Z')
  })

  it('stores id and type in metadata', () => {
    const result = transformDiscount(makeRaw())
    const meta = result.metadata as Record<string, unknown>
    expect(meta.id).toBe('disc-77')
    expect(meta.type).toBe('discounts')
  })

  it('produces a payload satisfying DiscountSchema', () => {
    const result = transformDiscount(makeRaw())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })
})

describe('untransformDiscount (lemon-squeezy)', () => {
  it('maps PERCENTAGE type to percent amount_type', () => {
    const body = untransformDiscount({ type: 'PERCENTAGE', value: 10 })
    expect(body.amount_type).toBe('percent')
  })

  it('maps FIXED_AMOUNT type to fixed amount_type', () => {
    const body = untransformDiscount({ type: 'FIXED_AMOUNT', value: 500 })
    expect(body.amount_type).toBe('fixed')
  })

  it('round-trips code and title', () => {
    const canonical = transformDiscount(makeRaw())
    const body = untransformDiscount(canonical)
    expect(body.code).toBe('SUMMER10')
    expect(body.name).toBe('Summer Sale')
  })
})
