import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawAfterpayRefund,
} from '../../../../../../../src/verticals/payments/adapters/afterpay/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('afterpay transformRefund', () => {
  it('maps a refund converting decimal amount to minor units', () => {
    const raw: RawAfterpayRefund = {
      refundId: 'ap-ref-001',
      orderId: 'ap-pay-001',
      amount: { amount: '25.00', currency: 'USD' },
      refundMerchantReference: 'ref-merchant-001',
      refundedAt: '2024-03-05T10:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('ap-ref-001')
    expect(result.chargeId).toBe('ap-pay-001')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('afterpay')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('always sets status to "succeeded"', () => {
    const raw: RawAfterpayRefund = {
      refundId: 'ap-ref-002',
      orderId: 'ap-pay-002',
      amount: { amount: '10.50', currency: 'AUD' },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.currency).toBe('AUD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to USD when currency is absent', () => {
    const raw: RawAfterpayRefund = {
      refundId: 'ap-ref-003',
      orderId: 'ap-pay-003',
      amount: { amount: '5.00' },
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('USD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('returns 0 amount when amount field is absent', () => {
    const raw: RawAfterpayRefund = {
      refundId: 'ap-ref-004',
      orderId: 'ap-pay-004',
    }
    const result = transformRefund(raw)
    expect(result.amount).toBe(0)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
