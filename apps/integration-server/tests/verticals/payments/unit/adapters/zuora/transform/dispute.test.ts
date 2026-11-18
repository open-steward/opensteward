import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawStripeDispute,
} from '../../../../../../../src/verticals/payments/adapters/zuora/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('zuora transformDispute', () => {
  it('maps amount, currency and status correctly', () => {
    const raw: RawStripeDispute = {
      id: 'zuora-dp-001',
      object: 'dispute',
      amount: 4500,
      currency: 'usd',
      status: 'needs_response',
      reason: 'fraudulent',
      charge: 'ch-001',
      created: 1709251200,
    }
    const result = transformDispute(raw)
    expect(result.id).toBe('zuora-dp-001')
    expect(result.amount).toBe(4500)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('needs_response')
    expect(result.reason).toBe('fraudulent')
    expect(result.chargeId).toBe('ch-001')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps status "won" and reason "duplicate"', () => {
    const raw: RawStripeDispute = {
      id: 'zuora-dp-002',
      object: 'dispute',
      amount: 800,
      currency: 'eur',
      status: 'won',
      reason: 'duplicate',
      charge: 'ch-002',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('won')
    expect(result.reason).toBe('duplicate')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('falls back to payment_intent as chargeId when charge absent', () => {
    const raw: RawStripeDispute = {
      id: 'zuora-dp-003',
      object: 'dispute',
      amount: 300,
      currency: 'gbp',
      status: 'lost',
      payment_intent: 'pi-zuora',
    }
    const result = transformDispute(raw)
    expect(result.chargeId).toBe('pi-zuora')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
