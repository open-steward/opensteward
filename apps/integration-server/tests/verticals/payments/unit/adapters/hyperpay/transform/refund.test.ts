import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawHyperpayRefund,
} from '../../../../../../../src/verticals/payments/adapters/hyperpay/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('hyperpay transformRefund', () => {
  it('maps a successful RF refund to status "succeeded"', () => {
    const raw: RawHyperpayRefund = {
      id: 'rf-001',
      referencedId: 'hp-pay-001',
      paymentType: 'RF',
      amount: '92.00',
      currency: 'USD',
      descriptor: 'Refund for order #42',
      result: { code: '000.000.000', description: 'Transaction succeeded' },
      timestamp: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(9200)
    expect(result.currency).toBe('USD')
    expect(result.chargeId).toBe('hp-pay-001')
    expect(result.gateway).toBe('hyperpay')
    expect(result.failureReason).toBeUndefined()
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a rejected refund to status "failed" with failureReason', () => {
    const raw: RawHyperpayRefund = {
      id: 'rf-002',
      referencedId: 'hp-pay-002',
      paymentType: 'RF',
      amount: '10.00',
      currency: 'SAR',
      result: { code: '800.100.152', description: 'Refund declined' },
      timestamp: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('Refund declined')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a pending result code to status "pending"', () => {
    const raw: RawHyperpayRefund = {
      id: 'rf-003',
      referencedId: 'hp-pay-003',
      paymentType: 'RF',
      amount: '5.00',
      currency: 'USD',
      result: { code: '000.200.000', description: 'Transaction pending' },
      timestamp: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
