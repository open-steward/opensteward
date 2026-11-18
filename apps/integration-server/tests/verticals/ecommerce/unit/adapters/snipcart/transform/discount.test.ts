import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawSnipcartDiscount,
} from '../../../../../../../src/verticals/ecommerce/adapters/snipcart/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeDiscount(overrides: Partial<RawSnipcartDiscount> = {}): RawSnipcartDiscount {
  return {
    id: 'disc-guid-abc',
    name: 'Summer 15% Off',
    trigger: 'Code',
    code: 'SUMMER15',
    type: 'Rate',
    rate: 15,
    maxNumberOfUsages: 200,
    numberOfUsages: 42,
    expires: '2024-08-31T23:59:59.000Z',
    combinable: true,
    ...overrides,
  }
}

describe('transformDiscount (Snipcart)', () => {
  it('maps id and code', () => {
    const result = transformDiscount(makeDiscount())
    expect(result.id).toBe('disc-guid-abc')
    expect(result.code).toBe('SUMMER15')
  })

  it('maps name to title', () => {
    const result = transformDiscount(makeDiscount())
    expect(result.title).toBe('Summer 15% Off')
  })

  it('maps Rate type to PERCENTAGE and rate value', () => {
    const result = transformDiscount(makeDiscount())
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(15)
  })

  it('maps FixedAmount type to FIXED_AMOUNT and converts to minor units', () => {
    const result = transformDiscount(
      makeDiscount({ type: 'FixedAmount', amount: 10.0, rate: null }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    // 10.00 USD → 1000 cents
    expect(result.value).toBe(1000)
    expect(result.currency).toBe('USD')
  })

  it('maps Shipping type to FREE_SHIPPING', () => {
    const result = transformDiscount(
      makeDiscount({ type: 'Shipping', shippingCost: 5.99, rate: null }),
    )
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps trigger=Product to appliesTo=PRODUCTS with itemId', () => {
    const result = transformDiscount(
      makeDiscount({ trigger: 'Product', itemId: 'item-abc', type: 'Rate', rate: 10 }),
    )
    expect(result.appliesTo).toBe('PRODUCTS')
    expect(result.productIds).toEqual(['item-abc'])
  })

  it('maps trigger=Code to appliesTo=ORDER', () => {
    const result = transformDiscount(makeDiscount())
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps usage fields', () => {
    const result = transformDiscount(makeDiscount())
    expect(result.usageLimit).toBe(200)
    expect(result.usageCount).toBe(42)
  })

  it('maps expires to endsAt', () => {
    const result = transformDiscount(makeDiscount())
    expect(result.endsAt).toBe('2024-08-31T23:59:59.000Z')
  })

  it('maps totalToReach to minimumPurchaseAmount', () => {
    const result = transformDiscount(makeDiscount({ totalToReach: 50.0 }))
    expect(result.minimumPurchaseAmount).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('omits minimumPurchaseAmount when totalToReach is zero', () => {
    const result = transformDiscount(makeDiscount({ totalToReach: 0 }))
    expect(result.minimumPurchaseAmount).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeDiscount()
    expect(transformDiscount(raw).metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    expect(() => DiscountSchema.parse(transformDiscount(makeDiscount()))).not.toThrow()
  })

  it('round-trips PERCENTAGE via untransformDiscount', () => {
    const canonical = transformDiscount(makeDiscount())
    const body = untransformDiscount(canonical)
    expect(body['type']).toBe('Rate')
    expect(body['rate']).toBe(15)
    expect(body['code']).toBe('SUMMER15')
    expect(body['expires']).toBe('2024-08-31T23:59:59.000Z')
  })

  it('round-trips FIXED_AMOUNT via untransformDiscount', () => {
    const canonical = transformDiscount(
      makeDiscount({ type: 'FixedAmount', amount: 10.0, rate: null, code: null }),
    )
    const body = untransformDiscount(canonical)
    expect(body['type']).toBe('FixedAmount')
    // minor → major: 1000 cents → 10.00
    expect(body['amount']).toBe(10)
  })
})
