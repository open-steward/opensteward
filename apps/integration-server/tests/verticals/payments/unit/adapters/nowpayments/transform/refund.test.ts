import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawNowpaymentsRefund,
} from '../../../../../../../src/verticals/payments/adapters/nowpayments/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('nowpayments transformRefund', () => {
  it('maps a "completed" refund to status "succeeded"', () => {
    const raw: RawNowpaymentsRefund = {
      id: 'ref-001',
      payment_id: 'pay-001',
      amount: 25.5,
      currency: 'USD',
      status: 'completed',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('ref-001')
    expect(result.externalId).toBe('ref-001')
    expect(result.chargeId).toBe('pay-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(2550)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('nowpayments')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a "success" status to "succeeded"', () => {
    const raw: RawNowpaymentsRefund = {
      id: 'ref-002',
      payment_id: 'pay-002',
      amount: 10,
      currency: 'EUR',
      status: 'success',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.currency).toBe('EUR')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a "failed" status to "failed"', () => {
    const raw: RawNowpaymentsRefund = {
      id: 'ref-003',
      payment_id: 'pay-003',
      amount: 5,
      currency: 'USD',
      status: 'failed',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps an unknown status to "pending"', () => {
    const raw: RawNowpaymentsRefund = {
      id: 'ref-004',
      payment_id: 'pay-004',
      amount: 20,
      currency: 'USD',
      status: 'processing',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to USD when absent', () => {
    const raw: RawNowpaymentsRefund = {
      id: 'ref-005',
      payment_id: 'pay-005',
      amount: 8,
      status: 'completed',
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('USD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
