import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawDoocaDiscount,
} from '../../../../../../../src/verticals/ecommerce/adapters/dooca-commerce/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeDiscount(overrides: Partial<RawDoocaDiscount> = {}): RawDoocaDiscount {
  return {
    id: 7,
    code: 'SUMMER10',
    name: '10% Summer Discount',
    type: 'percent',
    value: '10',
    minimum_value: '50.00',
    usage_limit: 100,
    usage_count: 5,
    active: true,
    starts_at: '2024-03-01T00:00:00Z',
    expires_at: '2024-09-01T00:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformDiscount (Dooca Commerce)', () => {
  it('maps id as string', () => {
    const result = transformDiscount(makeDiscount({ id: 7 }))
    expect(result.id).toBe('7')
  })

  it('maps code', () => {
    const result = transformDiscount(makeDiscount())
    expect(result.code).toBe('SUMMER10')
  })

  it('maps title from name', () => {
    const result = transformDiscount(makeDiscount())
    expect(result.title).toBe('10% Summer Discount')
  })

  it('maps type "percent" to PERCENTAGE', () => {
    const result = transformDiscount(makeDiscount({ type: 'percent' }))
    expect(result.type).toBe('PERCENTAGE')
  })

  it('maps type "value" to FIXED_AMOUNT', () => {
    const result = transformDiscount(makeDiscount({ type: 'value', value: '15.00' }))
    expect(result.type).toBe('FIXED_AMOUNT')
  })

  it('maps type "free_shipping" to FREE_SHIPPING', () => {
    const result = transformDiscount(makeDiscount({ type: 'free_shipping', value: '0' }))
    expect(result.type).toBe('FREE_SHIPPING')
  })

  it('keeps percentage value as-is (not converted to minor units)', () => {
    const result = transformDiscount(makeDiscount({ type: 'percent', value: '10' }))
    expect(result.value).toBe(10)
  })

  it('converts FIXED_AMOUNT value from BRL major to minor units', () => {
    const result = transformDiscount(makeDiscount({ type: 'value', value: '15.00' }))
    // BRL has 2 decimal places → 15.00 BRL = 1500 cents
    expect(result.value).toBe(1500)
    expect(result.currency).toBe('BRL')
  })

  it('maps minimumPurchaseAmount with BRL minor units', () => {
    const result = transformDiscount(makeDiscount({ minimum_value: '50.00' }))
    expect(result.minimumPurchaseAmount).toBeDefined()
    expect(result.minimumPurchaseAmount!.amount).toBe(5000)
    expect(result.minimumPurchaseAmount!.currency).toBe('BRL')
  })

  it('omits minimumPurchaseAmount when minimum_value is 0', () => {
    const result = transformDiscount(makeDiscount({ minimum_value: '0' }))
    expect(result.minimumPurchaseAmount).toBeUndefined()
  })

  it('maps usage_limit and usage_count', () => {
    const result = transformDiscount(makeDiscount())
    expect(result.usageLimit).toBe(100)
    expect(result.usageCount).toBe(5)
  })

  it('sets customerEligibility to ALL', () => {
    const result = transformDiscount(makeDiscount())
    expect(result.customerEligibility).toBe('ALL')
  })

  it('maps appliesTo FREE_SHIPPING when type is free_shipping', () => {
    const result = transformDiscount(makeDiscount({ type: 'free_shipping' }))
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps appliesTo ORDER for percent discounts', () => {
    const result = transformDiscount(makeDiscount())
    expect(result.appliesTo).toBe('ORDER')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeDiscount()
    const result = transformDiscount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying DiscountSchema', () => {
    const result = transformDiscount(makeDiscount())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })
})

describe('untransformDiscount (Dooca Commerce)', () => {
  it('maps PERCENTAGE type to "percent"', () => {
    const body = untransformDiscount({ type: 'PERCENTAGE', value: 10 })
    expect(body['type']).toBe('percent')
  })

  it('maps FIXED_AMOUNT type to "value"', () => {
    const body = untransformDiscount({ type: 'FIXED_AMOUNT', value: 1500 })
    expect(body['type']).toBe('value')
  })

  it('converts FIXED_AMOUNT minor units back to major units', () => {
    const body = untransformDiscount({ type: 'FIXED_AMOUNT', value: 1500 })
    expect(body['value']).toBe('15.00')
  })

  it('maps FREE_SHIPPING type to "free_shipping"', () => {
    const body = untransformDiscount({ type: 'FREE_SHIPPING' })
    expect(body['type']).toBe('free_shipping')
  })

  it('maps code', () => {
    const body = untransformDiscount({ code: 'PROMO20' })
    expect(body['code']).toBe('PROMO20')
  })

  it('maps usage_limit', () => {
    const body = untransformDiscount({ usageLimit: 50 })
    expect(body['usage_limit']).toBe(50)
  })
})
