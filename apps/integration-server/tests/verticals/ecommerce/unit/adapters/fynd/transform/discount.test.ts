/**
 * Fixture shape verified against `gofynd/fdk-client-javascript` @ commit
 * `7598488bf04e7a75bc44088441745538d524abec`,
 * `sdk/platform/Cart/CartPlatformModel.js` — `CouponUpdate()`.
 */
import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawFyndCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/fynd/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeCoupon(overrides: Partial<RawFyndCoupon> = {}): RawFyndCoupon {
  return {
    _id: 'cpn_abc123',
    code: 'ACME10',
    type_slug: 'percentage',
    rule: [{ value: 10 }],
    rule_definition: { currency_code: 'INR' },
    identifiers: { item_id: [500], collection_id: ['42'] },
    restrictions: { uses: { maximum: { total: 100 }, remaining: { total: 99 } } },
    _schedule: { start: '2026-01-15T09:30:00.000Z', end: null },
    date_meta: { created_on: '2026-01-15T09:30:00.000Z' },
    ...overrides,
  }
}

describe('transformDiscount', () => {
  it('maps a percentage coupon', () => {
    const result = transformDiscount(makeCoupon())
    expect(result.id).toBe('cpn_abc123')
    expect(result.code).toBe('ACME10')
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
    expect(result.productIds).toEqual(['500'])
    expect(result.collectionIds).toEqual(['42'])
    expect(result.usageLimit).toBe(100)
    expect(result.usageCount).toBe(1)
  })

  it('converts a fixed-amount coupon value from minor units', () => {
    const result = transformDiscount(
      makeCoupon({ type_slug: 'amount', rule: [{ value: 1000 }], rule_definition: { currency_code: 'INR' } }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(10)
  })

  it('throws when _id is missing', () => {
    expect(() => transformDiscount({ ...makeCoupon(), _id: undefined as unknown as string })).toThrow(
      /_id/,
    )
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCoupon()
    expect(transformDiscount(raw).metadata).toBe(raw)
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    expect(() => DiscountSchema.parse(transformDiscount(makeCoupon()))).not.toThrow()
  })
})

describe('untransformDiscount', () => {
  it('builds a CouponAdd/CouponUpdate-shaped body from a percentage discount', () => {
    const body = untransformDiscount({
      code: 'ACME10',
      type: 'PERCENTAGE',
      value: 10,
      currency: 'INR',
    })
    expect(body.code).toBe('ACME10')
    expect(body.type_slug).toBe('percentage')
    expect(body.rule).toEqual([{ value: 10 }])
    expect(body.rule_definition).toEqual({ currency_code: 'INR' })
  })

  it('converts a fixed-amount discount value to minor units', () => {
    const body = untransformDiscount({ type: 'FIXED_AMOUNT', value: 10, currency: 'INR' })
    expect(body.rule).toEqual([{ value: 1000 }])
  })
})
