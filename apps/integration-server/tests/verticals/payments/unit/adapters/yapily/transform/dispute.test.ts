import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawStripeDispute,
} from '../../../../../../../src/verticals/payments/adapters/yapily/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('yapily transformDispute (stripe-scaffold)', () => {
  it('maps a needs_response dispute with fraudulent reason', () => {
    const raw: RawStripeDispute = {
      id: 'dp-001',
      object: 'dispute',
      amount: 5000,
      currency: 'gbp',
      status: 'needs_response',
      reason: 'fraudulent',
      charge: 'ch-001',
      created: 1709251200,
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('needs_response')
    expect(result.reason).toBe('fraudulent')
    expect(result.chargeId).toBe('ch-001')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('GBP')
    expect(result.gateway).toBe('stripe')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps a won dispute', () => {
    const raw: RawStripeDispute = {
      id: 'dp-002',
      object: 'dispute',
      amount: 10000,
      currency: 'usd',
      status: 'won',
      charge: 'ch-002',
      created: 1709251200,
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('won')
    expect(result.reason).toBeUndefined()
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps subscription_canceled reason to "subscription_cancelled"', () => {
    const raw: RawStripeDispute = {
      id: 'dp-003',
      object: 'dispute',
      amount: 2500,
      currency: 'eur',
      status: 'lost',
      reason: 'subscription_canceled',
      charge: 'ch-003',
      created: 1709251200,
    }
    const result = transformDispute(raw)
    expect(result.reason).toBe('subscription_cancelled')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
