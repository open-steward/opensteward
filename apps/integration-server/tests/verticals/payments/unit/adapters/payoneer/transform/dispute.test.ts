import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawStripeDispute,
} from '../../../../../../../src/verticals/payments/adapters/payoneer/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('payoneer transformDispute', () => {
  it('maps a needs_response dispute with fraudulent reason', () => {
    const raw: RawStripeDispute = {
      id: 'dp_001',
      object: 'dispute',
      amount: 12500,
      currency: 'usd',
      status: 'needs_response',
      reason: 'fraudulent',
      charge: 'ch_001',
      evidence_details: { due_by: 1709251200 },
      created: 1709251200,
    }

    const result = transformDispute(raw)

    expect(result.id).toBe('dp_001')
    expect(result.chargeId).toBe('ch_001')
    expect(result.amount).toBe(12500)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('needs_response')
    expect(result.reason).toBe('fraudulent')
    expect(result.gateway).toBe('stripe')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps a won dispute', () => {
    const raw: RawStripeDispute = {
      id: 'dp_002',
      object: 'dispute',
      amount: 5000,
      currency: 'EUR',
      status: 'won',
      charge: 'ch_002',
      created: 1709251200,
    }

    const result = transformDispute(raw)

    expect(result.status).toBe('won')
    expect(result.currency).toBe('EUR')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps subscription_canceled reason to subscription_cancelled', () => {
    const raw: RawStripeDispute = {
      id: 'dp_003',
      object: 'dispute',
      amount: 3000,
      currency: 'GBP',
      status: 'under_review',
      reason: 'subscription_canceled',
      charge: 'ch_003',
      created: 1709251200,
    }

    const result = transformDispute(raw)

    expect(result.reason).toBe('subscription_cancelled')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
