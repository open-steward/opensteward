import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawStripeDispute,
} from '../../../../../../../src/verticals/payments/adapters/triple-a/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('triple-a transformDispute', () => {
  it('maps a lost dispute with duplicate reason', () => {
    const raw: RawStripeDispute = {
      id: 'dp-ta-001',
      object: 'dispute',
      amount: 8000,
      currency: 'usd',
      status: 'lost',
      reason: 'duplicate',
      charge: 'ch-ta-001',
      created: 1709251200,
    }
    const result = transformDispute(raw)
    expect(result.id).toBe('dp-ta-001')
    expect(result.status).toBe('lost')
    expect(result.reason).toBe('duplicate')
    expect(result.amount).toBe(8000)
    expect(result.currency).toBe('USD')
    expect(result.chargeId).toBe('ch-ta-001')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps an under_review dispute with payment_intent fallback', () => {
    const raw: RawStripeDispute = {
      id: 'dp-ta-002',
      object: 'dispute',
      amount: 3000,
      currency: 'EUR',
      status: 'under_review',
      payment_intent: 'pi-ta-001',
      created: 1709251200,
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('under_review')
    expect(result.chargeId).toBe('pi-ta-001')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
