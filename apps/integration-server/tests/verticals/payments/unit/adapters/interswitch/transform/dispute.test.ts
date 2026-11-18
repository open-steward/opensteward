import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawStripeDispute,
} from '../../../../../../../src/verticals/payments/adapters/interswitch/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('interswitch transformDispute', () => {
  it('maps a needs_response dispute with fraudulent reason', () => {
    const raw: RawStripeDispute = {
      id: 'dp-001',
      object: 'dispute',
      amount: 10000,
      currency: 'usd',
      status: 'needs_response',
      reason: 'fraudulent',
      charge: 'ch-001',
      created: 1709251200,
    }
    const result = transformDispute(raw)
    expect(result.id).toBe('dp-001')
    expect(result.status).toBe('needs_response')
    expect(result.reason).toBe('fraudulent')
    expect(result.chargeId).toBe('ch-001')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('stripe')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps a won dispute', () => {
    const raw: RawStripeDispute = {
      id: 'dp-002',
      object: 'dispute',
      amount: 5000,
      currency: 'usd',
      status: 'won',
      charge: 'ch-002',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('won')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('uses payment_intent as chargeId when charge is absent', () => {
    const raw: RawStripeDispute = {
      id: 'dp-003',
      object: 'dispute',
      amount: 2500,
      currency: 'gbp',
      status: 'under_review',
      payment_intent: 'pi-001',
    }
    const result = transformDispute(raw)
    expect(result.chargeId).toBe('pi-001')
    expect(result.currency).toBe('GBP')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
