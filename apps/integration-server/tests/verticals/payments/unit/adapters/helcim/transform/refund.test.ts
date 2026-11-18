import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawHelcimRefundTransaction,
} from '../../../../../../../src/verticals/payments/adapters/helcim/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('helcim transformRefund', () => {
  it('maps an APPROVED refund to status "succeeded"', () => {
    const raw: RawHelcimRefundTransaction = {
      transactionId: 9901,
      status: 'APPROVED',
      type: 'refund',
      amount: 49.99,
      currency: 'CAD',
      approvalCode: 'APR-001',
      dateCreated: '2024-03-01 00:00:00',
    }
    const result = transformRefund(raw, 'txn-orig-001')
    expect(result.id).toBe('9901')
    expect(result.externalId).toBe('9901')
    expect(result.chargeId).toBe('txn-orig-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('CAD')
    expect(result.gateway).toBe('helcim')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a DECLINED refund to status "failed"', () => {
    const raw: RawHelcimRefundTransaction = {
      transactionId: 9902,
      status: 'DECLINED',
      type: 'refund',
      amount: 25.0,
      currency: 'USD',
    }
    const result = transformRefund(raw, 'txn-orig-002')
    expect(result.status).toBe('failed')
    expect(result.chargeId).toBe('txn-orig-002')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps an unknown status refund to "pending"', () => {
    const raw: RawHelcimRefundTransaction = {
      transactionId: 9903,
      status: 'PROCESSING',
      type: 'refund',
      amount: 10.0,
      currency: 'CAD',
    }
    const result = transformRefund(raw, 'txn-orig-003')
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to CAD when absent', () => {
    const raw: RawHelcimRefundTransaction = {
      transactionId: 9904,
      status: 'APPROVED',
      amount: 5.0,
    }
    const result = transformRefund(raw, 'txn-orig-004')
    expect(result.currency).toBe('CAD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('uses originalTransactionId as chargeId regardless of the refund transactionId', () => {
    const raw: RawHelcimRefundTransaction = {
      transactionId: 9905,
      status: 'APPROVED',
      amount: 20.0,
      currency: 'USD',
    }
    const result = transformRefund(raw, 'original-99')
    expect(result.id).toBe('9905')
    expect(result.chargeId).toBe('original-99')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
