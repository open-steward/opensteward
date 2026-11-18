import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawBoltRefund,
} from '../../../../../../../src/verticals/payments/adapters/bolt/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('bolt transformRefund', () => {
  it('maps a completed refund to status "succeeded"', () => {
    const raw: RawBoltRefund = {
      id: 'rfnd-001',
      refund_reference: 'RFND-REF-001',
      transaction_reference: 'ORIG-TXN-001',
      status: 'completed',
      amount: { amount: 1500, currency: 'USD' },
      date_created: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('RFND-REF-001')
    expect(result.chargeId).toBe('ORIG-TXN-001')
    expect(result.amount).toBe(1500)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('bolt')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a failed refund', () => {
    const raw: RawBoltRefund = {
      refund_reference: 'RFND-FAIL',
      transaction_reference: 'ORIG-TXN-002',
      status: 'rejected',
      amount: 500,
      currency: 'GBP',
      failure_reason: 'Card expired',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('Card expired')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a cancelled refund', () => {
    const raw: RawBoltRefund = {
      reference: 'RFND-CANC',
      transaction_reference: 'ORIG-TXN-003',
      status: 'cancelled',
      amount: 200,
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('cancelled')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to USD when absent', () => {
    const raw: RawBoltRefund = {
      id: 'rfnd-002',
      transaction_reference: 'ORIG-TXN-004',
      status: 'completed',
      amount: 750,
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('USD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
