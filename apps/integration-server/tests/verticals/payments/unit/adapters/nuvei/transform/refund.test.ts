import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawNuveiRefund,
} from '../../../../../../../src/verticals/payments/adapters/nuvei/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('nuvei transformRefund', () => {
  it('maps an APPROVED refund to canonical Refund with status succeeded', () => {
    const raw: RawNuveiRefund = {
      transactionId: 're_001',
      relatedTransactionId: 'txn_original',
      transactionStatus: 'APPROVED',
      amount: '25.00',
      currency: 'usd',
      authCode: 'AUTH123',
      createdDate: '2024-03-01T00:00:00Z',
      updatedDate: '2024-03-01T01:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('re_001')
    expect(result.externalId).toBe('re_001')
    expect(result.chargeId).toBe('txn_original')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('nuvei')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps DECLINED transactionStatus to failed and includes failureReason from gwErrorReason', () => {
    const raw: RawNuveiRefund = {
      transactionId: 're_002',
      relatedTransactionId: 'txn_original_2',
      transactionStatus: 'DECLINED',
      amount: '10.00',
      currency: 'EUR',
      gwErrorReason: 'Refund not permitted',
      reason: 'Generic reason',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('Refund not permitted')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to reason when gwErrorReason is absent on failure', () => {
    const raw: RawNuveiRefund = {
      transactionId: 're_003',
      relatedTransactionId: 'txn_original_3',
      transactionStatus: 'ERROR',
      amount: '5.00',
      currency: 'GBP',
      reason: 'System error occurred',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('System error occurred')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('does not include failureReason when status is succeeded', () => {
    const raw: RawNuveiRefund = {
      transactionId: 're_004',
      relatedTransactionId: 'txn_ok',
      transactionStatus: 'APPROVED',
      amount: '1.00',
      currency: 'USD',
      gwErrorReason: 'Should not appear',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.failureReason).toBeUndefined()
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps PENDING transactionStatus to pending', () => {
    const raw: RawNuveiRefund = {
      transactionId: 're_005',
      relatedTransactionId: 'txn_pending',
      transactionStatus: 'PENDING',
      amount: '50.00',
      currency: 'USD',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to clientUniqueId for id when transactionId is absent', () => {
    const raw: RawNuveiRefund = {
      clientUniqueId: 'client_re_abc',
      relatedTransactionId: 'txn_fallback',
      transactionStatus: 'APPROVED',
      amount: '3.00',
      currency: 'USD',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('client_re_abc')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('uses request-level status=SUCCESS when transactionStatus is absent', () => {
    const raw: RawNuveiRefund = {
      transactionId: 're_006',
      relatedTransactionId: 'txn_statusless',
      status: 'SUCCESS',
      amount: '8.00',
      currency: 'USD',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults to USD when currency is absent', () => {
    const raw: RawNuveiRefund = {
      transactionId: 're_007',
      relatedTransactionId: 'txn_nocur',
      transactionStatus: 'APPROVED',
      amount: '2.00',
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('USD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('stores authCode in metadata', () => {
    const raw: RawNuveiRefund = {
      transactionId: 're_008',
      relatedTransactionId: 'txn_auth',
      transactionStatus: 'APPROVED',
      amount: '15.00',
      currency: 'USD',
      authCode: 'AUTHXYZ',
      clientUniqueId: 'cuid_re_008',
      errCode: 0,
    }
    const result = transformRefund(raw)
    expect(result.metadata.authCode).toBe('AUTHXYZ')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
