import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawDodoRefund,
} from '../../../../../../../src/verticals/payments/adapters/dodo-payments/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('dodo-payments transformRefund', () => {
  it('maps a succeeded refund with full fields', () => {
    const raw: RawDodoRefund = {
      refund_id: 'ref_001',
      payment_id: 'pay_001',
      business_id: 'biz_001',
      amount: 2500,
      currency: 'usd',
      status: 'succeeded',
      reason: 'Customer requested',
      is_partial: false,
      created_at: '2024-03-01T00:00:00Z',
      metadata: { note: 'approved' },
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('ref_001')
    expect(result.externalId).toBe('ref_001')
    expect(result.chargeId).toBe('pay_001')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('dodo-payments')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps "failed" status', () => {
    const raw: RawDodoRefund = {
      refund_id: 'ref_002',
      payment_id: 'pay_002',
      amount: 1000,
      currency: 'USD',
      status: 'failed',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps "pending" and "review" statuses to "pending"', () => {
    const rawPending: RawDodoRefund = {
      refund_id: 'ref_003',
      payment_id: 'pay_003',
      amount: 500,
      currency: 'USD',
      status: 'pending',
      created_at: '2024-03-01T00:00:00Z',
    }
    expect(transformRefund(rawPending).status).toBe('pending')

    const rawReview: RawDodoRefund = {
      refund_id: 'ref_004',
      payment_id: 'pay_004',
      amount: 500,
      currency: 'USD',
      status: 'review',
      created_at: '2024-03-01T00:00:00Z',
    }
    expect(transformRefund(rawReview).status).toBe('pending')
    expect(() => RefundSchema.parse(transformRefund(rawReview))).not.toThrow()
  })

  it('falls back to 0 when amount is null', () => {
    const raw: RawDodoRefund = {
      refund_id: 'ref_005',
      payment_id: 'pay_005',
      amount: null,
      currency: 'USD',
      status: 'pending',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.amount).toBe(0)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
