import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawSquarePaymentRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/square/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawSquarePaymentRefund> = {}): RawSquarePaymentRefund {
  return {
    id: 'REFUND_001',
    payment_id: 'PAY_001',
    order_id: 'ORDER_001',
    amount_money: { amount: 500, currency: 'USD' },
    reason: 'Customer request',
    status: 'COMPLETED',
    created_at: '2024-05-10T10:00:00Z',
    updated_at: '2024-05-10T10:05:00Z',
    ...overrides,
  }
}

describe('transformRefund (Square)', () => {
  it('maps core fields with money conversion', () => {
    const result = transformRefund(makeRefund())
    expect(result.id).toBe('REFUND_001')
    expect(result.orderId).toBe('ORDER_001')
    expect(result.amount).toEqual({ amount: 500, currency: 'USD' })
    expect(result.reason).toBe('Customer request')
  })

  it('maps payment_id to transactionIds', () => {
    const result = transformRefund(makeRefund())
    expect(result.transactionIds).toEqual(['PAY_001'])
  })

  it('falls back to payment_id when order_id is missing', () => {
    const result = transformRefund(makeRefund({ order_id: undefined }))
    expect(result.orderId).toBe('PAY_001')
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
    expect(raw['payment_id']).toBe('PAY_001')
    expect(raw['reason']).toBe('Customer request')
    expect((raw['amount_money'] as Record<string, unknown>)['amount']).toBe(500)
  })
})
