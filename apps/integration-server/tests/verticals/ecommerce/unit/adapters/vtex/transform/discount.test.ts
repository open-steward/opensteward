import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawVtexCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/vtex/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeCoupon(overrides: Partial<RawVtexCoupon> = {}): RawVtexCoupon {
  return {
    couponCode: 'SUMMER20',
    maxUsage: 100,
    maxUsagePerClient: 1,
    expirationInteractionLimit: '2024-12-31T23:59:59.000Z',
    createdIn: '2024-06-01T00:00:00.000Z',
    isArchived: false,
    ...overrides,
  }
}

describe('transformDiscount', () => {
  it('uses couponCode as both id and code', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.id).toBe('SUMMER20')
    expect(result.code).toBe('SUMMER20')
    expect(result.title).toBe('SUMMER20')
  })

  it('sets type and value to undefined — VTEX coupons lack these fields', () => {
    const result = transformDiscount(makeCoupon())
    // VTEX coupons are code-only; type/value live on the linked promotion
    expect(result.type).toBeUndefined()
    expect(result.value).toBeUndefined()
  })

  it('sets appliesTo to undefined', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.appliesTo).toBeUndefined()
  })

  it('maps usageLimit from maxUsage', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.usageLimit).toBe(100)
  })

  it('omits usageLimit when maxUsage is null', () => {
    const result = transformDiscount(makeCoupon({ maxUsage: null }))
    expect(result.usageLimit).toBeUndefined()
  })

  it('maps endsAt from expirationInteractionLimit', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.endsAt).toBe('2024-12-31T23:59:59.000Z')
  })

  it('maps createdAt from createdIn', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.createdAt).toBe('2024-06-01T00:00:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCoupon()
    const result = transformDiscount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    const result = transformDiscount(makeCoupon())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })
})

describe('untransformDiscount', () => {
  it('round-trips code, usageLimit, and endsAt', () => {
    const canonical = transformDiscount(makeCoupon())
    const raw = untransformDiscount(canonical)
    expect(raw['couponCode']).toBe('SUMMER20')
    expect(raw['maxUsage']).toBe(100)
    expect(raw['expirationInteractionLimit']).toBe('2024-12-31T23:59:59.000Z')
  })

  it('sets maxUsage to null when usageLimit is absent', () => {
    const raw = untransformDiscount({ code: 'SUMMER20' })
    expect(raw['maxUsage']).toBeNull()
  })
})
