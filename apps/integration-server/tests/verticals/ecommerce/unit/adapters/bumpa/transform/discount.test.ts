import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawBumpaDiscount,
} from '../../../../../../../src/verticals/ecommerce/adapters/bumpa/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

describe('transformDiscount (bumpa)', () => {
  const raw: RawBumpaDiscount = {
    id: 300,
    code: 'BUMPA20',
    name: 'Bumpa 20% Off',
    discount_type: 'percentage',
    value: '20',
    currency: 'NGN',
    applies_to: 'order',
    usage_limit: 200,
    usage_count: 10,
    starts_at: '2024-03-01T00:00:00Z',
    ends_at: '2024-06-01T00:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
  }

  it('maps id to string', () => {
    expect(transformDiscount(raw).id).toBe('300')
  })

  it('maps code', () => {
    expect(transformDiscount(raw).code).toBe('BUMPA20')
  })

  it('maps title from name', () => {
    expect(transformDiscount(raw).title).toBe('Bumpa 20% Off')
  })

  it('maps type to PERCENTAGE', () => {
    expect(transformDiscount(raw).type).toBe('PERCENTAGE')
  })

  it('maps percentage value as-is (0-100)', () => {
    expect(transformDiscount(raw).value).toBe(20)
  })

  it('converts FIXED_AMOUNT value to minor units', () => {
    const fixed: RawBumpaDiscount = {
      ...raw,
      discount_type: 'fixed',
      value: '500',
    }
    const result = transformDiscount(fixed)
    expect(result.type).toBe('FIXED_AMOUNT')
    // 500 NGN major-unit → minor units (NGN = 100 subunits → 50000)
    expect(result.value).toBe(50000)
  })

  it('maps appliesTo to ORDER', () => {
    expect(transformDiscount(raw).appliesTo).toBe('ORDER')
  })

  it('maps usageLimit and usageCount', () => {
    expect(transformDiscount(raw).usageLimit).toBe(200)
    expect(transformDiscount(raw).usageCount).toBe(10)
  })

  it('maps startsAt and endsAt', () => {
    const result = transformDiscount(raw)
    expect(result.startsAt).toBe('2024-03-01T00:00:00Z')
    expect(result.endsAt).toBe('2024-06-01T00:00:00Z')
  })

  it('maps minimum purchase amount to minor units', () => {
    const withMin: RawBumpaDiscount = {
      ...raw,
      minimum_purchase: '1000',
    }
    const result = transformDiscount(withMin)
    // 1000 NGN → 100000 kobo
    expect(result.minimumPurchaseAmount?.amount).toBe(100000)
  })

  it('handles times_used as fallback for usageCount', () => {
    const result = transformDiscount({ ...raw, usage_count: undefined, times_used: 7 })
    expect(result.usageCount).toBe(7)
  })

  it('maps FREE_SHIPPING type', () => {
    const result = transformDiscount({ ...raw, discount_type: 'free_shipping' })
    expect(result.type).toBe('FREE_SHIPPING')
  })

  it('uses expires_at as fallback for endsAt', () => {
    const result = transformDiscount({ ...raw, ends_at: null, expires_at: '2024-12-31T00:00:00Z' })
    expect(result.endsAt).toBe('2024-12-31T00:00:00Z')
  })

  it('passes DiscountSchema validation', () => {
    expect(() => DiscountSchema.parse(transformDiscount(raw))).not.toThrow()
  })
})

describe('untransformDiscount (bumpa)', () => {
  it('round-trips code and name', () => {
    const canonical = transformDiscount({
      id: 1,
      code: 'TEST',
      name: 'Test Discount',
      discount_type: 'percentage',
      value: '10',
    })
    const body = untransformDiscount(canonical)
    expect(body.code).toBe('TEST')
    expect(body.name).toBe('Test Discount')
    expect(body.discount_type).toBe('percentage')
  })
})
