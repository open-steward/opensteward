import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawApexxRefund,
} from '../../../../../../../src/verticals/payments/adapters/apexx/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('apexx transformRefund', () => {
  it('maps a REFUNDED transaction to succeeded', () => {
    const raw: RawApexxRefund = {
      _id: 'RF-001',
      transaction_status: 'REFUNDED',
      transaction_type: 'REFUND',
      refund_amount: 1500,
      currency: 'GBP',
      original_transaction: 'TX-ORIG-001',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)

    expect(result.id).toBe('RF-001')
    expect(result.chargeId).toBe('TX-ORIG-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(1500)
    expect(result.currency).toBe('GBP')
    expect(result.gateway).toBe('apexx')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to chargeId parameter when original_transaction is absent', () => {
    const raw: RawApexxRefund = {
      _id: 'RF-002',
      transaction_status: 'SETTLED',
      refund_amount: 800,
      currency: 'USD',
    }
    const result = transformRefund(raw, 'TX-FALLBACK')

    expect(result.chargeId).toBe('TX-FALLBACK')
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a FAILED refund to failed status with failureReason', () => {
    const raw: RawApexxRefund = {
      _id: 'RF-003',
      transaction_status: 'FAILED',
      refund_amount: 500,
      currency: 'EUR',
      original_transaction: 'TX-003',
      reason_message: 'Refund processing error',
    }
    const result = transformRefund(raw)

    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('Refund processing error')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELLED refund to cancelled', () => {
    const raw: RawApexxRefund = {
      _id: 'RF-004',
      transaction_status: 'CANCELLED',
      amount: 300,
      currency: 'GBP',
      original_transaction: 'TX-004',
    }
    const result = transformRefund(raw)

    expect(result.status).toBe('cancelled')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('uses amount field when refund_amount is absent', () => {
    const raw: RawApexxRefund = {
      _id: 'RF-005',
      transaction_status: 'REFUNDED',
      amount: 1200,
      currency: 'GBP',
      original_transaction: 'TX-005',
    }
    const result = transformRefund(raw)

    expect(result.amount).toBe(1200)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
