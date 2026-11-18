import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawLightspeedDiscount,
} from '../../../../../../../src/verticals/ecommerce/adapters/lightspeed-retail/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeDiscount(overrides: Partial<RawLightspeedDiscount> = {}): RawLightspeedDiscount {
  return {
    discountID: '401',
    name: '10% Off',
    discountPercent: '10',
    discountAmount: '0',
    requireCustomer: 'false',
    archived: 'false',
    createTime: '2024-01-20T08:00:00+00:00',
    timeStamp: '2024-06-01T12:00:00+00:00',
    ...overrides,
  }
}

describe('transformDiscount (Lightspeed Retail)', () => {
  it('maps percentage discount', () => {
    const result = transformDiscount(makeDiscount())
    expect(result.id).toBe('401')
    expect(result.title).toBe('10% Off')
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
    expect(result.currency).toBeUndefined()
    expect(result.appliesTo).toBe('ORDER')
    expect(result.customerEligibility).toBe('ALL')
  })

  it('maps fixed amount discount', () => {
    const result = transformDiscount(
      makeDiscount({ discountPercent: '0', discountAmount: '5.00', name: '$5 Off' }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(500)
    expect(result.currency).toBe('USD')
  })

  it('maps customer-required discount', () => {
    const result = transformDiscount(makeDiscount({ requireCustomer: 'true' }))
    expect(result.customerEligibility).toBe('SPECIFIC')
  })

  it('handles zero values as undefined type', () => {
    const result = transformDiscount(
      makeDiscount({ discountPercent: '0', discountAmount: '0' }),
    )
    expect(result.type).toBeUndefined()
    expect(result.value).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeDiscount()
    const result = transformDiscount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    const result = transformDiscount(makeDiscount())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('round-trips percentage via untransformDiscount', () => {
    const canonical = transformDiscount(makeDiscount())
    const raw = untransformDiscount(canonical)
    expect(raw['name']).toBe('10% Off')
    expect(raw['discountPercent']).toBe('10')
    expect(raw['discountAmount']).toBe('0')
  })

  it('round-trips fixed amount via untransformDiscount', () => {
    const canonical = transformDiscount(
      makeDiscount({ discountPercent: '0', discountAmount: '5.00' }),
    )
    const raw = untransformDiscount(canonical)
    expect(raw['discountAmount']).toBe('5')
    expect(raw['discountPercent']).toBe('0')
  })
})
