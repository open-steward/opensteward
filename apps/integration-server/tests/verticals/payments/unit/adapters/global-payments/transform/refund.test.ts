import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawStripeRefund,
} from '../../../../../../../src/verticals/payments/adapters/global-payments/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('global-payments transformRefund', () => {
  it('maps a succeeded refund', () => {
    const raw: RawStripeRefund = {
      id: 're-001',
      object: 'refund',
      amount: 5000,
      currency: 'usd',
      status: 'succeeded',
      charge: 'ch-001',
      reason: 'requested_by_customer',
      created: 1709251200,
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('re-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.chargeId).toBe('ch-001')
    expect(result.reason).toBe('requested_by_customer')
    expect(result.gateway).toBe('stripe')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a failed refund to status "failed"', () => {
    const raw: RawStripeRefund = {
      id: 're-002',
      object: 'refund',
      amount: 2000,
      currency: 'eur',
      status: 'failed',
      charge: 'ch-002',
      failure_reason: 'lost_or_stolen_card',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('lost_or_stolen_card')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a canceled refund to status "cancelled"', () => {
    const raw: RawStripeRefund = {
      id: 're-003',
      object: 'refund',
      amount: 1000,
      currency: 'gbp',
      status: 'canceled',
      charge: 'ch-003',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('cancelled')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('round-trips chargeId and amount through untransformRefund', () => {
    const raw: RawStripeRefund = {
      id: 're-004',
      object: 'refund',
      amount: 3000,
      currency: 'usd',
      status: 'succeeded',
      charge: 'ch-004',
    }
    const canonical = transformRefund(raw)
    const wire = untransformRefund(canonical)
    expect(wire.charge).toBe('ch-004')
    expect(wire.amount).toBe(3000)
    expect(() => RefundSchema.parse(canonical)).not.toThrow()
  })
})
