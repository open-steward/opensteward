import { describe, it, expect } from 'vitest'
import {
  transformCoupon,
  untransformCoupon,
  type RawTiendanubeCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/tiendanube/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeCoupon(overrides: Partial<RawTiendanubeCoupon> = {}): RawTiendanubeCoupon {
  return {
    id: 55,
    code: 'SAVE10',
    type: 'percentage',
    value: '10',
    valid: true,
    used: 3,
    max_uses: 100,
    start_date: '2026-01-01T00:00:00.000Z',
    end_date: '2026-12-31T23:59:59.000Z',
    min_price: '50.00',
    ...overrides,
  }
}

describe('transformCoupon (Tiendanube)', () => {
  it('maps id, code and type', () => {
    const result = transformCoupon(makeCoupon())
    expect(result.id).toBe('55')
    expect(result.code).toBe('SAVE10')
    expect(result.type).toBe('PERCENTAGE')
  })

  it('maps type=absolute to FIXED_AMOUNT', () => {
    const result = transformCoupon(makeCoupon({ type: 'absolute', value: '5.00' }))
    expect(result.type).toBe('FIXED_AMOUNT')
    // FIXED_AMOUNT: 5.00 major → 500 minor
    expect(result.value).toBe(500)
  })

  it('maps type=shipping to FREE_SHIPPING', () => {
    const result = transformCoupon(makeCoupon({ type: 'shipping' }))
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps percentage value as-is (not converted to minor)', () => {
    const result = transformCoupon(makeCoupon({ type: 'percentage', value: '10' }))
    expect(result.value).toBe(10)
  })

  it('maps usage limits and count', () => {
    const result = transformCoupon(makeCoupon())
    expect(result.usageLimit).toBe(100)
    expect(result.usageCount).toBe(3)
  })

  it('maps minimumPurchaseAmount from min_price to minor units', () => {
    const result = transformCoupon(makeCoupon())
    expect(result.minimumPurchaseAmount).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('maps startsAt and endsAt', () => {
    const result = transformCoupon(makeCoupon())
    expect(result.startsAt).toBe('2026-01-01T00:00:00.000Z')
    expect(result.endsAt).toBe('2026-12-31T23:59:59.000Z')
  })

  it('sets customerEligibility to ALL', () => {
    expect(transformCoupon(makeCoupon()).customerEligibility).toBe('ALL')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCoupon()
    const result = transformCoupon(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying DiscountSchema', () => {
    const result = transformCoupon(makeCoupon())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('round-trips code and type via untransformCoupon', () => {
    const discount = transformCoupon(makeCoupon())
    const body = untransformCoupon(discount)
    expect(body['code']).toBe('SAVE10')
    expect(body['type']).toBe('percentage')
    expect(body['start_date']).toBe('2026-01-01T00:00:00.000Z')
    expect(body['end_date']).toBe('2026-12-31T23:59:59.000Z')
  })
})
