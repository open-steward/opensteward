import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawStripeRefund,
} from '../../../../../../../src/verticals/payments/adapters/yapily/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('yapily transformRefund (stripe-scaffold)', () => {
  it('maps a succeeded refund with reason', () => {
    const raw: RawStripeRefund = {
      id: 're-001',
      object: 'refund',
      amount: 5000,
      currency: 'usd',
      status: 'succeeded',
      reason: 'requested_by_customer',
      charge: 'ch-001',
      created: 1709251200,
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.reason).toBe('requested_by_customer')
    expect(result.chargeId).toBe('ch-001')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('stripe')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps canceled status to "cancelled"', () => {
    const raw: RawStripeRefund = {
      id: 're-002',
      object: 'refund',
      amount: 2500,
      currency: 'gbp',
      status: 'canceled',
      charge: 'ch-002',
      created: 1709251200,
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('cancelled')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformRefund', () => {
    const raw: RawStripeRefund = {
      id: 're-003',
      object: 'refund',
      amount: 1000,
      currency: 'eur',
      status: 'succeeded',
      reason: 'duplicate',
      charge: 'ch-003',
      created: 1709251200,
    }
    const canonical = transformRefund(raw)
    expect(() => RefundSchema.parse(canonical)).not.toThrow()
    const out = untransformRefund(canonical)
    expect(out.charge).toBe('ch-003')
    expect(out.amount).toBe(1000)
  })
})
