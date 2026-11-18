import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawSquareRefund,
} from '../../../../../../../src/verticals/payments/adapters/square/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('square transformRefund', () => {
  it('maps a COMPLETED refund', () => {
    const raw: RawSquareRefund = {
      id: 'SQ-REF-001',
      payment_id: 'PAY-001',
      status: 'COMPLETED',
      amount_money: { amount: 1500, currency: 'USD' },
      reason: 'customer request',
      created_at: '2024-05-15T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('SQ-REF-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(1500)
    expect(result.currency).toBe('USD')
    expect(result.chargeId).toBe('PAY-001')
    expect(result.reason).toBe('requested_by_customer')
    expect(result.gateway).toBe('square')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a PENDING refund', () => {
    const raw: RawSquareRefund = {
      id: 'SQ-REF-002',
      payment_id: 'PAY-002',
      status: 'PENDING',
      amount_money: { amount: 500, currency: 'EUR' },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a fraud reason to "fraudulent"', () => {
    const raw: RawSquareRefund = {
      id: 'SQ-REF-003',
      payment_id: 'PAY-003',
      status: 'COMPLETED',
      amount_money: { amount: 2000, currency: 'GBP' },
      reason: 'fraud detected',
    }
    const result = transformRefund(raw)
    expect(result.reason).toBe('fraudulent')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a REJECTED refund to "failed"', () => {
    const raw: RawSquareRefund = {
      id: 'SQ-REF-004',
      payment_id: 'PAY-004',
      status: 'REJECTED',
      amount_money: { amount: 100, currency: 'USD' },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
