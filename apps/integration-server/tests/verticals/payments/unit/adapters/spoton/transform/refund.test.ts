import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawStripeRefund,
} from '../../../../../../../src/verticals/payments/adapters/spoton/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('spoton transformRefund', () => {
  it('maps a succeeded refund with charge id', () => {
    const raw: RawStripeRefund = {
      id: 're_spoton_1',
      object: 'refund',
      amount: 1000,
      currency: 'usd',
      status: 'succeeded',
      reason: 'requested_by_customer',
      charge: 'ch_spoton_1',
      metadata: {},
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('re_spoton_1')
    expect(result.amount).toBe(1000)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.chargeId).toBe('ch_spoton_1')
    expect(result.reason).toBe('requested_by_customer')
    expect(result.gateway).toBe('stripe')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps status "failed" correctly', () => {
    const raw: RawStripeRefund = {
      id: 're_spoton_2',
      object: 'refund',
      amount: 500,
      currency: 'eur',
      status: 'failed',
      charge: 'ch_spoton_2',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.currency).toBe('EUR')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps status "canceled" to "cancelled"', () => {
    const raw: RawStripeRefund = {
      id: 're_spoton_3',
      object: 'refund',
      amount: 200,
      currency: 'gbp',
      status: 'canceled',
      charge: 'ch_spoton_3',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('cancelled')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps reason "fraudulent" correctly', () => {
    const raw: RawStripeRefund = {
      id: 're_spoton_4',
      object: 'refund',
      amount: 750,
      currency: 'usd',
      status: 'succeeded',
      reason: 'fraudulent',
      charge: 'ch_spoton_4',
    }
    const result = transformRefund(raw)
    expect(result.reason).toBe('fraudulent')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to payment_intent when charge is absent', () => {
    const raw: RawStripeRefund = {
      id: 're_spoton_5',
      object: 'refund',
      amount: 300,
      currency: 'usd',
      status: 'succeeded',
      payment_intent: 'pi_spoton_1',
    }
    const result = transformRefund(raw)
    expect(result.chargeId).toBe('pi_spoton_1')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
