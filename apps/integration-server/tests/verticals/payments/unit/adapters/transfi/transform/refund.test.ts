import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawTransfiRefund,
} from '../../../../../../../src/verticals/payments/adapters/transfi/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('transfi transformRefund', () => {
  it('maps a succeeded refund', () => {
    const raw: RawTransfiRefund = {
      refundId: 'ref-001',
      orderId: 'order-001',
      fiatAmount: 50.0,
      currency: 'USD',
      status: 'success',
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('ref-001')
    expect(result.externalId).toBe('ref-001')
    expect(result.chargeId).toBe('order-001')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('transfi')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a failed refund', () => {
    const raw: RawTransfiRefund = {
      refundId: 'ref-002',
      orderId: 'order-002',
      fiatAmount: 25.0,
      currency: 'EUR',
      status: 'failed',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.currency).toBe('EUR')
    expect(result.amount).toBe(2500)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a pending refund for unknown status', () => {
    const raw: RawTransfiRefund = {
      refundId: 'ref-003',
      orderId: 'order-003',
      fiatAmount: 10.0,
      currency: 'GBP',
      status: 'processing',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
