import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawStripeDispute,
} from '../../../../../../../src/verticals/payments/adapters/spoton/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('spoton transformDispute', () => {
  it('maps a won dispute', () => {
    const raw: RawStripeDispute = {
      id: 'dp_spoton_1',
      object: 'dispute',
      amount: 5000,
      currency: 'usd',
      status: 'won',
      reason: 'fraudulent',
      charge: 'ch_spoton_1',
      created: 1709251200,
    }
    const result = transformDispute(raw)
    expect(result.id).toBe('dp_spoton_1')
    expect(result.status).toBe('won')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.chargeId).toBe('ch_spoton_1')
    expect(result.reason).toBe('fraudulent')
    expect(result.gateway).toBe('stripe')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps needs_response status', () => {
    const raw: RawStripeDispute = {
      id: 'dp_spoton_2',
      object: 'dispute',
      amount: 2000,
      currency: 'eur',
      status: 'needs_response',
      charge: 'ch_spoton_2',
      created: 1709251200,
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('needs_response')
    expect(result.currency).toBe('EUR')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps under_review status', () => {
    const raw: RawStripeDispute = {
      id: 'dp_spoton_3',
      object: 'dispute',
      amount: 3000,
      currency: 'gbp',
      status: 'under_review',
      reason: 'duplicate',
      charge: 'ch_spoton_3',
      created: 1709251200,
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('under_review')
    expect(result.reason).toBe('duplicate')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('falls back to payment_intent when charge is absent', () => {
    const raw: RawStripeDispute = {
      id: 'dp_spoton_4',
      object: 'dispute',
      amount: 1000,
      currency: 'usd',
      status: 'lost',
      payment_intent: 'pi_spoton_1',
      created: 1709251200,
    }
    const result = transformDispute(raw)
    expect(result.chargeId).toBe('pi_spoton_1')
    expect(result.status).toBe('lost')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
