import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawPaytrailRefund,
} from '../../../../../../../src/verticals/payments/adapters/paytrail/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('paytrail transformRefund', () => {
  it('maps a successful refund correctly', () => {
    const raw: RawPaytrailRefund = {
      refundId: 'ref-paytrail-001',
      transactionId: 'pt-txn-001',
      amount: 2500,
      currency: 'EUR',
      status: 'success',
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('ref-paytrail-001')
    expect(result.externalId).toBe('ref-paytrail-001')
    expect(result.chargeId).toBe('pt-txn-001')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('EUR')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('paytrail')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a failed refund correctly', () => {
    const raw: RawPaytrailRefund = {
      refundId: 'ref-paytrail-002',
      transactionId: 'pt-txn-002',
      amount: 1000,
      currency: 'EUR',
      status: 'failure',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps unknown refund status to pending', () => {
    const raw: RawPaytrailRefund = {
      refundId: 'ref-paytrail-003',
      transactionId: 'pt-txn-003',
      amount: 500,
      currency: 'EUR',
      status: 'processing',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to EUR when currency is missing', () => {
    const raw: RawPaytrailRefund = {
      refundId: 'ref-paytrail-004',
      transactionId: 'pt-txn-004',
      amount: 100,
      status: 'succeeded',
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('EUR')
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
