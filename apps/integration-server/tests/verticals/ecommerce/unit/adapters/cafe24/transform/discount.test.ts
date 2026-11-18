import { describe, it, expect } from 'vitest'
import {
  transformCoupon,
  untransformCoupon,
  type RawCafe24Coupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/cafe24/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

describe('transformCoupon (cafe24)', () => {
  const raw: RawCafe24Coupon = {
    coupon_no: 50,
    coupon_name: '10% Off Coupon',
    coupon_code: 'CAFE10',
    discount_method: 'Y',
    discount_value: 10,
    available_count: 500,
    issued_count: 42,
    start_date: '2024-03-01T00:00:00Z',
    end_date: '2024-06-01T00:00:00Z',
    created_date: '2024-03-01T00:00:00Z',
  }

  it('maps id from coupon_no', () => {
    expect(transformCoupon(raw).id).toBe('50')
  })

  it('maps code from coupon_code', () => {
    expect(transformCoupon(raw).code).toBe('CAFE10')
  })

  it('maps title from coupon_name', () => {
    expect(transformCoupon(raw).title).toBe('10% Off Coupon')
  })

  it('maps discount_method Y → PERCENTAGE', () => {
    expect(transformCoupon(raw).type).toBe('PERCENTAGE')
  })

  it('maps percentage value as-is', () => {
    expect(transformCoupon(raw).value).toBe(10)
  })

  it('maps discount_method W → FIXED_AMOUNT', () => {
    const fixed: RawCafe24Coupon = {
      ...raw,
      discount_method: 'W',
      discount_value: 5000,
    }
    const result = transformCoupon(fixed, 'KRW')
    expect(result.type).toBe('FIXED_AMOUNT')
    // KRW has 0 fractional digits — major === minor, so 5000 KRW → 5000
    expect(result.value).toBe(5000)
    expect(result.currency).toBe('KRW')
  })

  it('maps discount_method F → FREE_SHIPPING', () => {
    const free: RawCafe24Coupon = { ...raw, discount_method: 'F' }
    expect(transformCoupon(free).type).toBe('FREE_SHIPPING')
  })

  it('maps usageLimit from available_count', () => {
    expect(transformCoupon(raw).usageLimit).toBe(500)
  })

  it('maps usageCount from issued_count', () => {
    expect(transformCoupon(raw).usageCount).toBe(42)
  })

  it('maps startsAt and endsAt', () => {
    // toIsoDatetime normalizes to include milliseconds
    const result = transformCoupon(raw)
    expect(result.startsAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.endsAt).toBe('2024-06-01T00:00:00.000Z')
  })

  it('always sets appliesTo to ORDER', () => {
    expect(transformCoupon(raw).appliesTo).toBe('ORDER')
  })

  it('always sets customerEligibility to ALL', () => {
    expect(transformCoupon(raw).customerEligibility).toBe('ALL')
  })

  it('passes DiscountSchema validation', () => {
    expect(() => DiscountSchema.parse(transformCoupon(raw))).not.toThrow()
  })

  it('handles null coupon_code', () => {
    const result = transformCoupon({ ...raw, coupon_code: null })
    expect(result.code).toBeUndefined()
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCoupon (cafe24)', () => {
  it('round-trips coupon_name and type mapping', () => {
    const canonical = transformCoupon(raw)
    const body = untransformCoupon(canonical)
    expect(body.coupon_name).toBe('10% Off Coupon')
    expect(body.coupon_code).toBe('CAFE10')
    expect(body.discount_method).toBe('Y')
    expect(body.discount_value).toBe(10)
  })

  it('maps FIXED_AMOUNT → W method', () => {
    const body = untransformCoupon({ type: 'FIXED_AMOUNT', value: 3000 })
    expect(body.discount_method).toBe('W')
  })

  it('maps FREE_SHIPPING → F method', () => {
    const body = untransformCoupon({ type: 'FREE_SHIPPING' })
    expect(body.discount_method).toBe('F')
  })
})

const raw: RawCafe24Coupon = {
  coupon_no: 50,
  coupon_name: '10% Off Coupon',
  coupon_code: 'CAFE10',
  discount_method: 'Y',
  discount_value: 10,
  available_count: 500,
  issued_count: 42,
  start_date: '2024-03-01T00:00:00Z',
  end_date: '2024-06-01T00:00:00Z',
  created_date: '2024-03-01T00:00:00Z',
}
