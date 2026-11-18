import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RefundHint,
} from '../../../../../../../src/verticals/payments/adapters/fiserv/transform/refund'
import type { RawFiservTransaction } from '../../../../../../../src/verticals/payments/adapters/fiserv/transform/charge'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('fiserv transformRefund', () => {
  it('maps a COMPLETED refund to status "succeeded" with amount from response', () => {
    const raw: RawFiservTransaction = {
      gatewayResponse: {
        transactionType: 'REFUND',
        transactionState: 'COMPLETED',
        transactionProcessingDetails: {
          transactionId: 'TXN-R01',
          orderId: 'ORD-001',
          transactionTimestamp: '2024-03-01T00:00:00Z',
          apiTraceId: 'TRACE-R01',
        },
      },
      amount: { total: 25.0, currency: 'USD' },
      paymentReceipt: {
        approvedAmount: { total: 25.0, currency: 'USD' },
        processorResponseDetails: {
          approvalStatus: 'APPROVED',
          approvalCode: 'REFOK',
        },
      },
    }
    const hint: RefundHint = { chargeId: 'TXN-001' }
    const result = transformRefund(raw, hint)
    expect(result.id).toBe('TXN-R01')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('USD')
    expect(result.chargeId).toBe('TXN-001')
    expect(result.gateway).toBe('fiserv')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps APPROVED state to status "succeeded"', () => {
    const raw: RawFiservTransaction = {
      gatewayResponse: {
        transactionState: 'APPROVED',
        transactionProcessingDetails: { transactionId: 'TXN-R02' },
      },
      amount: { total: 10.0, currency: 'USD' },
    }
    const hint: RefundHint = { chargeId: 'TXN-002' }
    const result = transformRefund(raw, hint)
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps DECLINED state to status "failed" with failure reason', () => {
    const raw: RawFiservTransaction = {
      gatewayResponse: {
        transactionState: 'DECLINED',
        transactionProcessingDetails: { transactionId: 'TXN-R03' },
      },
      amount: { total: 15.0, currency: 'USD' },
      paymentReceipt: {
        processorResponseDetails: {
          approvalStatus: 'DECLINED',
          responseMessage: 'Refund not permitted',
        },
      },
    }
    const hint: RefundHint = { chargeId: 'TXN-003' }
    const result = transformRefund(raw, hint)
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('Refund not permitted')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps CANCELLED state to status "cancelled"', () => {
    const raw: RawFiservTransaction = {
      gatewayResponse: {
        transactionState: 'CANCELLED',
        transactionProcessingDetails: { transactionId: 'TXN-R04' },
      },
      amount: { total: 8.0, currency: 'USD' },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('cancelled')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('uses hint.amount when response amount is absent', () => {
    const raw: RawFiservTransaction = {
      gatewayResponse: {
        transactionState: 'COMPLETED',
        transactionProcessingDetails: { transactionId: 'TXN-R05' },
      },
    }
    const hint: RefundHint = { chargeId: 'TXN-005', amount: 999, currency: 'USD' }
    const result = transformRefund(raw, hint)
    expect(result.amount).toBe(999)
    expect(result.currency).toBe('USD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to orderId for chargeId when hint.chargeId is absent', () => {
    const raw: RawFiservTransaction = {
      gatewayResponse: {
        transactionState: 'COMPLETED',
        transactionProcessingDetails: { transactionId: 'TXN-R06', orderId: 'ORD-006' },
      },
      amount: { total: 5.0, currency: 'USD' },
    }
    const result = transformRefund(raw)
    expect(result.chargeId).toBe('ORD-006')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
