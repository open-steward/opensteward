import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawCircleRefund,
} from '../../../../../../../src/verticals/payments/adapters/circle/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('circle transformRefund', () => {
  it('maps a "paid" refund to status "succeeded"', () => {
    const raw: RawCircleRefund = {
      id: 'ref-001',
      type: 'refund',
      status: 'paid',
      amount: { amount: '25.00', currency: 'USD' },
      createDate: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw, 'pay-001')
    expect(result.id).toBe('ref-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('USD')
    expect(result.chargeId).toBe('pay-001')
    expect(result.gateway).toBe('circle')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a "confirmed" refund to status "succeeded"', () => {
    const raw: RawCircleRefund = {
      id: 'ref-002',
      type: 'refund',
      status: 'confirmed',
      amount: { amount: '10.00', currency: 'EUR' },
    }
    const result = transformRefund(raw, 'pay-002')
    expect(result.status).toBe('succeeded')
    expect(result.currency).toBe('EUR')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a "pending" refund to status "pending"', () => {
    const raw: RawCircleRefund = {
      id: 'ref-003',
      type: 'refund',
      status: 'pending',
      amount: { amount: '50.00', currency: 'USD' },
    }
    const result = transformRefund(raw, 'pay-003')
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a "failed" refund and captures errorCode as failureReason', () => {
    const raw: RawCircleRefund = {
      id: 'ref-004',
      type: 'refund',
      status: 'failed',
      amount: { amount: '30.00', currency: 'USD' },
      errorCode: 'refund_failed',
    }
    const result = transformRefund(raw, 'pay-004')
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('refund_failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
