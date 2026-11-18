import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawToastDiscount,
} from '../../../../../../../src/verticals/ecommerce/adapters/toast/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeDiscount(overrides: Partial<RawToastDiscount> = {}): RawToastDiscount {
  return {
    guid: 'DISC_001',
    name: 'Happy Hour 20%',
    type: 'PERCENT',
    percentage: 20,
    active: true,
    itemApplyType: 'ALL',
    createdDate: '2024-01-01T00:00:00.000Z',
    modifiedDate: '2024-02-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformDiscount (Toast)', () => {
  it('maps core fields for percentage discount', () => {
    const result = transformDiscount(makeDiscount())
    expect(result.id).toBe('DISC_001')
    expect(result.title).toBe('Happy Hour 20%')
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(20)
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps fixed amount discount', () => {
    const result = transformDiscount(
      makeDiscount({ type: 'FIXED', amount: 5.00, percentage: undefined }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(500)
    expect(result.currency).toBe('USD')
  })

  it('maps BOGO discount', () => {
    const result = transformDiscount(makeDiscount({ type: 'BOGO' }))
    expect(result.type).toBe('BUY_X_GET_Y')
  })

  it('maps itemApplyType SPECIFIC to PRODUCTS', () => {
    const result = transformDiscount(makeDiscount({ itemApplyType: 'SPECIFIC' }))
    expect(result.appliesTo).toBe('PRODUCTS')
  })

  it('maps minimum purchase amount', () => {
    const result = transformDiscount(makeDiscount({ minAmount: 25.00 }))
    expect(result.minimumPurchaseAmount).toEqual({ amount: 2500, currency: 'USD' })
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

  it('round-trips writable fields via untransformDiscount', () => {
    const canonical = transformDiscount(makeDiscount())
    const raw = untransformDiscount(canonical)
    expect(raw['name']).toBe('Happy Hour 20%')
    expect(raw['type']).toBe('PERCENT')
    expect(raw['percentage']).toBe(20)
    expect(raw['itemApplyType']).toBe('ALL')
  })

  it('untransformDiscount maps FIXED_AMOUNT type', () => {
    const raw = untransformDiscount({ type: 'FIXED_AMOUNT', value: 10, title: 'Test' })
    expect(raw['type']).toBe('FIXED')
    expect(raw['amount']).toBe(10)
  })
})
