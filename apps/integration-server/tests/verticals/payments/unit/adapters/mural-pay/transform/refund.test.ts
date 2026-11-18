import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawMuralPayRefund,
} from '../../../../../../../src/verticals/payments/adapters/mural-pay/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('mural-pay transformRefund', () => {
  it('maps a successful refund with all fields', () => {
    const raw: RawMuralPayRefund = {
      id: 're-001',
      paymentId: 'pay-001',
      amount: '25.00',
      currency: 'USD',
      status: 'success',
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('re-001')
    expect(result.externalId).toBe('re-001')
    expect(result.chargeId).toBe('pay-001')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('mural-pay')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a failed refund', () => {
    const raw: RawMuralPayRefund = {
      id: 're-002',
      paymentId: 'pay-002',
      amount: '10.00',
      currency: 'EUR',
      status: 'failed',
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.currency).toBe('EUR')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a completed refund status to "succeeded"', () => {
    const raw: RawMuralPayRefund = {
      id: 're-003',
      paymentId: 'pay-003',
      amount: '5.00',
      currency: 'USD',
      status: 'completed',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults to pending for unknown status', () => {
    const raw: RawMuralPayRefund = {
      id: 're-004',
      paymentId: 'pay-004',
      amount: '15.00',
      currency: 'USD',
      status: 'processing',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to USD when missing', () => {
    const raw: RawMuralPayRefund = {
      id: 're-005',
      paymentId: 'pay-005',
      amount: '8.00',
      status: 'succeeded',
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('USD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
