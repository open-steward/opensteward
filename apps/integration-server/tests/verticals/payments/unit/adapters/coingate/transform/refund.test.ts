import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawCoingateRefund,
} from '../../../../../../../src/verticals/payments/adapters/coingate/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('coingate transformRefund', () => {
  it('maps a "completed" refund to status "succeeded"', () => {
    const raw: RawCoingateRefund = {
      id: 55,
      status: 'completed',
      refund_amount: '10.00',
      refund_currency: { id: 1, symbol: 'EUR' },
      order: { id: 12345, price_currency: 'EUR', price_amount: '10.00' },
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('55')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(1000)
    expect(result.currency).toBe('EUR')
    expect(result.chargeId).toBe('12345')
    expect(result.gateway).toBe('coingate')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a "rejected" refund to status "failed" with rejection_reason', () => {
    const raw: RawCoingateRefund = {
      id: 56,
      status: 'rejected',
      request_amount: '5.00',
      rejection_reason: 'insufficient_balance',
      refund_currency: { symbol: 'EUR' },
      order: { id: 12346 },
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('insufficient_balance')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a "pending" refund to status "pending"', () => {
    const raw: RawCoingateRefund = {
      id: 57,
      status: 'pending',
      request_amount: '20.00',
      order: { id: 12347, price_currency: 'USD' },
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('prefers refund_amount over request_amount for the canonical amount', () => {
    const raw: RawCoingateRefund = {
      id: 58,
      status: 'completed',
      request_amount: '15.00',
      refund_amount: '14.50',
      refund_currency: { symbol: 'EUR' },
      order: { id: 12348 },
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    // refund_amount "14.50" → 1450 minor units
    expect(result.amount).toBe(1450)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
