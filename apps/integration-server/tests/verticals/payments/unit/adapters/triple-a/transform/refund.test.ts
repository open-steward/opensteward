import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawStripeRefund,
} from '../../../../../../../src/verticals/payments/adapters/triple-a/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('triple-a transformRefund', () => {
  it('maps a succeeded refund with requested_by_customer reason', () => {
    const raw: RawStripeRefund = {
      id: 're-ta-001',
      object: 'refund',
      amount: 9900,
      currency: 'usd',
      status: 'succeeded',
      reason: 'requested_by_customer',
      charge: 'ch-ta-001',
      created: 1709251200,
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('re-ta-001')
    expect(result.amount).toBe(9900)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.reason).toBe('requested_by_customer')
    expect(result.chargeId).toBe('ch-ta-001')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a failed refund', () => {
    const raw: RawStripeRefund = {
      id: 're-ta-002',
      object: 'refund',
      amount: 5000,
      currency: 'EUR',
      status: 'failed',
      charge: 'ch-ta-002',
      created: 1709251200,
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.currency).toBe('EUR')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('round-trips chargeId via untransformRefund', () => {
    const raw: RawStripeRefund = {
      id: 're-ta-003',
      object: 'refund',
      amount: 2000,
      currency: 'GBP',
      charge: 'ch-ta-rt',
    }
    const transformed = transformRefund(raw)
    const back = untransformRefund(transformed)
    expect(back.charge).toBe('ch-ta-rt')
    expect(back.amount).toBe(2000)
  })
})
