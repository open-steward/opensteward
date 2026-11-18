import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawHyperswitchRefund,
} from '../../../../../../../src/verticals/payments/adapters/hyperswitch/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('hyperswitch transformRefund', () => {
  it('maps a succeeded refund with integer amount', () => {
    const raw: RawHyperswitchRefund = {
      refund_id: 're_001',
      payment_id: 'pay_001',
      amount: 5000,
      currency: 'USD',
      status: 'succeeded',
      reason: 'requested_by_customer',
      connector: 'stripe',
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.chargeId).toBe('pay_001')
    // reason is mapped to 'other' when raw.reason is truthy
    expect(result.reason).toBe('other')
    expect(result.gateway).toBe('hyperswitch')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a failed refund with error message', () => {
    const raw: RawHyperswitchRefund = {
      refund_id: 're_002',
      payment_id: 'pay_002',
      amount: 2000,
      currency: 'EUR',
      status: 'failed',
      error_code: 'refund_not_allowed',
      error_message: 'Refund window expired',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('Refund window expired')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps "review" status to "pending"', () => {
    const raw: RawHyperswitchRefund = {
      refund_id: 're_003',
      payment_id: 'pay_003',
      amount: 1000,
      currency: 'GBP',
      status: 'review',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps null reason to undefined (not "other")', () => {
    const raw: RawHyperswitchRefund = {
      refund_id: 're_004',
      payment_id: 'pay_004',
      amount: 500,
      currency: 'USD',
      status: 'succeeded',
      reason: null,
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.reason).toBeUndefined()
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
