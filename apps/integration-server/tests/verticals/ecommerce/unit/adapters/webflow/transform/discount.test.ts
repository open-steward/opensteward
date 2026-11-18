import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawWebflowDiscount,
} from '../../../../../../../src/verticals/ecommerce/adapters/webflow/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeDiscount(overrides: Partial<RawWebflowDiscount> = {}): RawWebflowDiscount {
  return {
    _id: 'disc_001',
    code: 'SAVE20',
    type: 'percentage',
    value: 20,
    currency: 'USD',
    startsAt: '2024-01-01T00:00:00Z',
    endsAt: '2024-12-31T23:59:59Z',
    createdOn: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformDiscount', () => {
  it('maps core fields', () => {
    const result = transformDiscount(makeDiscount())
    expect(result.id).toBe('disc_001')
    expect(result.code).toBe('SAVE20')
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(20)
  })

  it('maps fixed_amount type', () => {
    const result = transformDiscount(makeDiscount({ type: 'fixed_amount' }))
    expect(result.type).toBe('FIXED_AMOUNT')
  })

  it('maps free_shipping type', () => {
    const result = transformDiscount(makeDiscount({ type: 'free_shipping' }))
    expect(result.type).toBe('FREE_SHIPPING')
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

  it('round-trips code via untransformDiscount', () => {
    const canonical = transformDiscount(makeDiscount())
    const raw = untransformDiscount(canonical)
    expect(raw.code).toBe('SAVE20')
    expect(raw.type).toBe('percentage')
  })
})
