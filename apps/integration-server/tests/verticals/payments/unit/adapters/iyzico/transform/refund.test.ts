import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawIyzicoRefund,
} from '../../../../../../../src/verticals/payments/adapters/iyzico/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('iyzico transformRefund', () => {
  it('maps status success to "succeeded" and links chargeId', () => {
    const raw: RawIyzicoRefund = {
      status: 'success',
      paymentId: 'pay-001',
      paymentTransactionId: 'txn-001',
      refundHostReference: 'rhref-001',
      price: 25.0,
      currency: 'TRY',
      systemTime: 1709251200000,
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.chargeId).toBe('pay-001')
    expect(result.id).toBe('rhref-001')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('TRY')
    expect(result.gateway).toBe('iyzico')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps status failure to "failed" and sets failureReason', () => {
    const raw: RawIyzicoRefund = {
      status: 'failure',
      paymentId: 'pay-002',
      paymentTransactionId: 'txn-002',
      price: 10.0,
      currency: 'USD',
      errorCode: 'NOT_REFUNDABLE',
      errorMessage: 'Payment not refundable',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('Payment not refundable')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('uses paymentTransactionId as id when refundHostReference is absent', () => {
    const raw: RawIyzicoRefund = {
      status: 'success',
      paymentId: 'pay-003',
      paymentTransactionId: 'txn-003',
      price: 5.0,
      currency: 'EUR',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('txn-003')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
