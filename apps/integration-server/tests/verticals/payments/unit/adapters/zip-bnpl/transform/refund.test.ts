import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawStripeRefund,
} from '../../../../../../../src/verticals/payments/adapters/zip-bnpl/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('zip-bnpl transformRefund', () => {
  it('maps amount, currency and status correctly', () => {
    const raw: RawStripeRefund = {
      id: 'zip-re-001',
      object: 'refund',
      amount: 1500,
      currency: 'usd',
      status: 'succeeded',
      reason: 'requested_by_customer',
      charge: 'ch-001',
      created: 1709251200,
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('zip-re-001')
    expect(result.amount).toBe(1500)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.reason).toBe('requested_by_customer')
    expect(result.chargeId).toBe('ch-001')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps status "failed" and reason "fraudulent"', () => {
    const raw: RawStripeRefund = {
      id: 'zip-re-002',
      object: 'refund',
      amount: 750,
      currency: 'eur',
      status: 'failed',
      reason: 'fraudulent',
      charge: 'ch-002',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.reason).toBe('fraudulent')
    expect(result.currency).toBe('EUR')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformRefund', () => {
    const raw: RawStripeRefund = {
      id: 'zip-re-003',
      object: 'refund',
      amount: 2000,
      currency: 'gbp',
      status: 'succeeded',
      reason: 'duplicate',
      charge: 'ch-003',
    }
    const result = transformRefund(raw)
    const back = untransformRefund(result)
    expect(back.charge).toBe('ch-003')
    expect(back.amount).toBe(2000)
    expect(back.reason).toBe('duplicate')
  })
})
