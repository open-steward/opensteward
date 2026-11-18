import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawTelrRefund,
} from '../../../../../../../src/verticals/payments/adapters/telr/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('telr transformRefund', () => {
  it('maps a succeeded refund correctly', () => {
    const raw: RawTelrRefund = {
      ref: 'ref-001',
      order_ref: 'telr-ref-001',
      status: 'success',
      amount: 0.5,
      currency: 'AED',
      date: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('ref-001')
    expect(result.chargeId).toBe('telr-ref-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(50)
    expect(result.currency).toBe('AED')
    expect(result.gateway).toBe('telr')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a "completed" refund to status "succeeded"', () => {
    const raw: RawTelrRefund = {
      ref: 'ref-002',
      order_ref: 'telr-ref-002',
      status: 'completed',
      amount: 20,
      currency: 'USD',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.currency).toBe('USD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a failed refund to status "failed"', () => {
    const raw: RawTelrRefund = {
      ref: 'ref-003',
      order_ref: 'telr-ref-003',
      status: 'failed',
      amount: 10,
      currency: 'AED',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('treats unknown status as "pending"', () => {
    const raw: RawTelrRefund = {
      ref: 'ref-004',
      order_ref: 'telr-ref-004',
      status: 'processing',
      amount: 5,
      currency: 'AED',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to AED when currency is absent', () => {
    const raw: RawTelrRefund = {
      ref: 'ref-005',
      order_ref: 'telr-ref-005',
      status: 'success',
      amount: 8,
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('AED')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
