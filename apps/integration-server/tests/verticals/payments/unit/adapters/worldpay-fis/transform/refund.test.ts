import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawWorldpayRefund,
} from '../../../../../../../src/verticals/payments/adapters/worldpay-fis/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('worldpay-fis transformRefund', () => {
  it('maps a refunded refund to canonical status "succeeded"', () => {
    const raw: RawWorldpayRefund = {
      refundId: 'ref_001',
      paymentId: 'pay_001',
      value: { amount: 2500, currency: 'USD' },
      outcome: 'refunded',
      reference: { transactionReference: 'TXREF001' },
      lastEventDateTime: '2026-01-20T10:00:00.000Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('ref_001')
    expect(result.externalId).toBe('ref_001')
    expect(result.chargeId).toBe('pay_001')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('worldpay-fis')
    expect(result.metadata['transactionReference']).toBe('TXREF001')
    expect(result.createdAt).toBe('2026-01-20T10:00:00.000Z')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a non-refunded outcome to canonical status "pending"', () => {
    const raw: RawWorldpayRefund = {
      refundId: 'ref_002',
      paymentId: 'pay_002',
      value: { amount: 1000, currency: 'GBP' },
      outcome: 'submitted',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('GBP')
    expect(result.chargeId).toBe('pay_002')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults status to "pending" when outcome is absent', () => {
    const raw: RawWorldpayRefund = {
      refundId: 'ref_003',
      paymentId: 'pay_003',
      value: { amount: 500, currency: 'EUR' },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(500)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('picks up currency from nested value field', () => {
    const raw: RawWorldpayRefund = {
      refundId: 'ref_004',
      paymentId: 'pay_004',
      value: { amount: 750, currency: 'cad' },
      outcome: 'refunded',
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('CAD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('has empty metadata when reference is absent', () => {
    const raw: RawWorldpayRefund = {
      refundId: 'ref_005',
      paymentId: 'pay_005',
      value: { amount: 300, currency: 'USD' },
      outcome: 'refunded',
    }
    const result = transformRefund(raw)
    expect(result.metadata).toEqual({})
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
