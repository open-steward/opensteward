import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawCrystallizeRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/crystallize/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawCrystallizeRefund> = {}): RawCrystallizeRefund {
  return {
    id: 'order-001:refund-001',
    orderId: 'order-001',
    amount: { amount: 24.99, currency: 'USD' },
    reason: 'Defective item',
    createdAt: '2024-05-10T14:00:00.000Z',
    ...overrides,
  }
}

describe('transformRefund (Crystallize)', () => {
  it('maps core fields', () => {
    const result = transformRefund(makeRefund())
    expect(result.id).toBe('order-001:refund-001')
    expect(result.orderId).toBe('order-001')
    expect(result.amount).toEqual({ amount: 2499, currency: 'USD' })
    expect(result.reason).toBe('Defective item')
  })

  it('handles missing amount', () => {
    const result = transformRefund(makeRefund({ amount: null }))
    expect(result.amount).toBeUndefined()
  })

  it('handles null reason', () => {
    const result = transformRefund(makeRefund({ reason: null }))
    expect(result.reason).toBeUndefined()
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

  it('round-trips writable fields via untransformRefund', () => {
    const canonical = transformRefund(makeRefund())
    const raw = untransformRefund(canonical)
    expect(raw['amount']).toBe(2499)
    expect(raw['reason']).toBe('Defective item')
  })
})
