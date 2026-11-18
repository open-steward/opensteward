import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawScalapayRefund,
} from '../../../../../../../src/verticals/payments/adapters/scalapay/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('scalapay transformRefund', () => {
  it('maps a REFUNDED refund to succeeded status', () => {
    const raw: RawScalapayRefund = {
      refundToken: 'ref-tok-001',
      token: 'tok-001',
      status: 'REFUNDED',
      amount: { amount: '25.00', currency: 'EUR' },
      merchantReference: 'order-001',
      merchantRefundReference: 'refund-001',
      refundedAt: '2024-03-02T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('ref-tok-001')
    expect(result.externalId).toBe('ref-tok-001')
    expect(result.chargeId).toBe('tok-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('EUR')
    expect(result.gateway).toBe('scalapay')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a PENDING refund correctly', () => {
    const raw: RawScalapayRefund = {
      refundToken: 'ref-tok-002',
      token: 'tok-002',
      status: 'PENDING',
      amount: { amount: '10.00', currency: 'EUR' },
      refundedAt: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a FAILED refund correctly', () => {
    const raw: RawScalapayRefund = {
      refundToken: 'ref-tok-003',
      token: 'tok-003',
      status: 'FAILED',
      refundAmount: { amount: '15.00', currency: 'EUR' },
      refundedAt: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.amount).toBe(1500)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('treats absent status as succeeded (endpoint convention)', () => {
    const raw: RawScalapayRefund = {
      refundToken: 'ref-tok-004',
      orderToken: 'tok-004',
      amount: { amount: '5.00', currency: 'EUR' },
      refundedAt: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.chargeId).toBe('tok-004')
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
