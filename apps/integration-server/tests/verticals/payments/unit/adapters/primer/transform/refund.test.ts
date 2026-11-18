import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawPrimerRefund,
} from '../../../../../../../src/verticals/payments/adapters/primer/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('primer transformRefund', () => {
  it('extracts refund from REFUND transaction in transactions array', () => {
    const raw: RawPrimerRefund = {
      id: 'pay_settled',
      status: 'PARTIALLY_SETTLED',
      currencyCode: 'USD',
      amount: 2000,
      amountRefunded: 500,
      transactions: [
        {
          transactionType: 'REFUND',
          processorTransactionId: 'ref_txn_001',
          processorStatus: 'SETTLED',
          amount: 500,
          currencyCode: 'USD',
          date: '2024-03-01T00:00:00Z',
        },
      ],
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('ref_txn_001')
    expect(result.chargeId).toBe('pay_settled')
    expect(result.amount).toBe(500)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('primer')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('synthesises a stable id when processorTransactionId is absent', () => {
    const raw: RawPrimerRefund = {
      id: 'pay_abc',
      status: 'PARTIALLY_SETTLED',
      currencyCode: 'USD',
      amount: 1000,
      amountRefunded: 300,
      transactions: [
        {
          transactionType: 'REFUND',
          amount: 300,
          currencyCode: 'USD',
        },
      ],
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('pay_abc_refund')
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('infers "succeeded" from amountRefunded when no transaction exists', () => {
    const raw: RawPrimerRefund = {
      id: 'pay_no_txn',
      currencyCode: 'USD',
      amount: 1000,
      amountRefunded: 1000,
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(1000)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps refundReason containing "fraud" to "fraudulent"', () => {
    const raw: RawPrimerRefund = {
      id: 'pay_fraud',
      currencyCode: 'USD',
      amount: 500,
      amountRefunded: 500,
      refundReason: 'customer fraud dispute',
    }
    const result = transformRefund(raw)
    expect(result.reason).toBe('fraudulent')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps refundReason containing "customer" to "requested_by_customer"', () => {
    const raw: RawPrimerRefund = {
      id: 'pay_cust',
      currencyCode: 'USD',
      amount: 800,
      amountRefunded: 800,
      refundReason: 'customer request',
    }
    const result = transformRefund(raw)
    expect(result.reason).toBe('requested_by_customer')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps processorStatus "FAILED" in transaction to refund status "failed"', () => {
    const raw: RawPrimerRefund = {
      id: 'pay_fail',
      currencyCode: 'USD',
      amount: 600,
      amountRefunded: 0,
      transactions: [
        {
          transactionType: 'REFUND',
          processorStatus: 'FAILED',
          amount: 600,
          currencyCode: 'USD',
        },
      ],
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
