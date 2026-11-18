/**
 * Virto Commerce Promotion (+ Coupon) → canonical Discount.
 *
 * Field shapes verified against the live demo instance's
 * VirtoCommerce.Marketing/swagger.json `components.schemas.Promotion` /
 * `Coupon` (fetched 2026-09-13). A promotion's actual discount logic lives
 * in a `dynamicExpression` rule tree (not a simple type+value pair), so
 * canonical `type`/`value` are left unmapped rather than guessed — the raw
 * expression is still reachable via `metadata`.
 */
import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawVirtoPromotion,
  type RawVirtoCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/virto-commerce/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makePromotion(overrides: Partial<RawVirtoPromotion> = {}): RawVirtoPromotion {
  return {
    id: 'promo-1',
    name: 'Spring Sale',
    isActive: true,
    maxUsageCount: 1000,
    startDate: '2026-01-15T09:30:00Z',
    endDate: '2026-04-01T00:00:00Z',
    hasCoupons: true,
    createdDate: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeCoupon(overrides: Partial<RawVirtoCoupon> = {}): RawVirtoCoupon {
  return {
    id: 'coupon-1',
    code: 'SPRING10',
    promotionId: 'promo-1',
    maxUsesNumber: 100,
    totalUsesCount: 12,
    expirationDate: '2026-04-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformDiscount (virto-commerce)', () => {
  it('maps core fields from the promotion', () => {
    const result = transformDiscount(makePromotion())
    expect(result.id).toBe('promo-1')
    expect(result.title).toBe('Spring Sale')
    expect(result.startsAt).toBe('2026-01-15T09:30:00Z')
  })

  it('has no code and falls back to the promotion usage limit with no coupon', () => {
    const result = transformDiscount(makePromotion())
    expect(result.code).toBeUndefined()
    expect(result.usageLimit).toBe(1000)
  })

  it('merges the coupon code, usage limit and expiry when supplied', () => {
    const result = transformDiscount(makePromotion(), makeCoupon())
    expect(result.code).toBe('SPRING10')
    expect(result.usageLimit).toBe(100)
    expect(result.usageCount).toBe(12)
    expect(result.endsAt).toBe('2026-04-01T00:00:00Z')
  })

  it('leaves type/value unmapped — Virto promotions have no simple type+value shape', () => {
    const result = transformDiscount(makePromotion())
    expect(result.type).toBeUndefined()
    expect(result.value).toBeUndefined()
  })

  it('preserves the raw payload in metadata', () => {
    const promotion = makePromotion()
    const coupon = makeCoupon()
    const result = transformDiscount(promotion, coupon)
    expect(result.metadata['promotion']).toEqual(promotion)
    expect(result.metadata['coupon']).toEqual(coupon)
  })

  it('satisfies DiscountSchema, with and without a coupon', () => {
    expect(() => DiscountSchema.parse(transformDiscount(makePromotion()))).not.toThrow()
    expect(() => DiscountSchema.parse(transformDiscount(makePromotion(), makeCoupon()))).not.toThrow()
  })

  it('round-trips writable fields via untransformDiscount', () => {
    const canonical = transformDiscount(makePromotion(), makeCoupon())
    const raw = untransformDiscount(canonical)
    expect(raw['name']).toBe('Spring Sale')
  })
})
