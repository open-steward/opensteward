import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawStripeRefund,
} from '../../../../../../../src/verticals/payments/adapters/bridge-open-banking/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('bridge-open-banking transformRefund', () => {
  it('maps a succeeded refund', () => {
    const raw: RawStripeRefund = {
      id: 're-001',
      object: 'refund',
      amount: 2500,
      currency: 'usd',
      status: 'succeeded',
      reason: 'requested_by_customer',
      charge: 'ch-001',
      created: 1709251200,
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('re-001')
    expect(result.chargeId).toBe('ch-001')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.reason).toBe('requested_by_customer')
    expect(result.gateway).toBe('stripe')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a failed refund', () => {
    const raw: RawStripeRefund = {
      id: 're-002',
      object: 'refund',
      amount: 1000,
      currency: 'eur',
      status: 'failed',
      charge: 'ch-002',
      failure_reason: 'lost_or_stolen_card',
      created: 1709251200,
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('lost_or_stolen_card')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('round-trips chargeId and amount through untransformRefund', () => {
    const raw: RawStripeRefund = {
      id: 're-003',
      object: 'refund',
      amount: 500,
      currency: 'usd',
      status: 'succeeded',
      charge: 'ch-003',
      created: 1709251200,
    }
    const result = transformRefund(raw)
    const back = untransformRefund(result)
    expect(back.charge).toBe('ch-003')
    expect(back.amount).toBe(500)
  })
})
