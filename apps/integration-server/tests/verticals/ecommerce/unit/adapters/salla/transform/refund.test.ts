import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawSallaRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/salla/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawSallaRefund> = {}): RawSallaRefund {
  return {
    id: 302,
    order_id: 8001,
    amount: { amount: 50.0, currency: 'SAR' },
    reason: 'Product damaged on arrival',
    note: 'Customer provided photos',
    created_at: '2024-06-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformRefund', () => {
  it('maps id and orderId', () => {
    const result = transformRefund(makeRefund())
    expect(result.id).toBe('302')
    expect(result.orderId).toBe('8001')
  })

  it('converts amount to minor units', () => {
    const result = transformRefund(makeRefund())
    expect(result.amount).toEqual({ amount: 5000, currency: 'SAR' })
  })

  it('maps reason and note', () => {
    const result = transformRefund(makeRefund())
    expect(result.reason).toBe('Product damaged on arrival')
    expect(result.note).toBe('Customer provided photos')
  })

  it('omits amount when not provided', () => {
    const result = transformRefund(makeRefund({ amount: undefined }))
    expect(result.amount).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeRefund()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies RefundSchema', () => {
    const result = transformRefund(makeRefund())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformRefund', () => {
    const canonical = transformRefund(makeRefund())
    const raw = untransformRefund(canonical)
    expect(raw.reason).toBe('Product damaged on arrival')
    expect(raw.note).toBe('Customer provided photos')
  })
})
