import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawDecentroRefund,
} from '../../../../../../../src/verticals/payments/adapters/decentro/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('decentro transformRefund', () => {
  it('maps a SUCCESS refund to status "succeeded" with chargeId from context', () => {
    const raw: RawDecentroRefund = {
      decentroTxnId: 'DREF-001',
      status: 'SUCCESS',
      data: {
        transactionStatus: 'SUCCESS',
        bankReferenceNumber: 'BANK-REF-001',
        npciTransactionId: 'NPCI-001',
      },
    }
    const result = transformRefund(raw, { chargeId: 'DECT-001', amount: 100 })
    expect(result.id).toBe('DREF-001')
    expect(result.status).toBe('succeeded')
    expect(result.chargeId).toBe('DECT-001')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('INR')
    expect(result.gateway).toBe('decentro')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a PENDING refund to status "pending"', () => {
    const raw: RawDecentroRefund = {
      decentroTxnId: 'DREF-002',
      data: {
        transactionStatus: 'PENDING',
      },
    }
    const result = transformRefund(raw, { chargeId: 'DECT-002', amount: 50 })
    expect(result.status).toBe('pending')
    expect(result.chargeId).toBe('DECT-002')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a FAILED refund and includes failureReason', () => {
    const raw: RawDecentroRefund = {
      decentroTxnId: 'DREF-003',
      message: 'Refund rejected by bank',
      data: {
        transactionStatus: 'FAILED',
        transactionStatusDescription: 'Refund rejected by bank',
      },
    }
    const result = transformRefund(raw, { chargeId: 'DECT-003', amount: 75 })
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('Refund rejected by bank')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
