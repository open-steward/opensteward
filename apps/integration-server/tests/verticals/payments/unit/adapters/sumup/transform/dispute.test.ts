import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawStripeDispute,
} from '../../../../../../../src/verticals/payments/adapters/sumup/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('sumup transformDispute', () => {
  it('maps id, amount, currency and gateway', () => {
    const raw: RawStripeDispute = {
      id: 'dp_001',
      object: 'dispute',
      amount: 2000,
      currency: 'usd',
      status: 'needs_response',
      charge: 'ch_abc',
    }
    const result = transformDispute(raw)
    expect(result.id).toBe('dp_001')
    expect(result.externalId).toBe('dp_001')
    expect(result.amount).toBe(2000)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('stripe')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('resolves chargeId from charge, falling back to payment_intent', () => {
    const rawCharge: RawStripeDispute = {
      id: 'dp_002',
      object: 'dispute',
      amount: 500,
      currency: 'usd',
      status: 'won',
      charge: 'ch_primary',
      payment_intent: 'pi_fallback',
    }
    expect(transformDispute(rawCharge).chargeId).toBe('ch_primary')

    const rawIntent: RawStripeDispute = {
      id: 'dp_003',
      object: 'dispute',
      amount: 500,
      currency: 'usd',
      status: 'won',
      payment_intent: 'pi_fallback',
    }
    expect(transformDispute(rawIntent).chargeId).toBe('pi_fallback')
  })

  it('maps known status values', () => {
    const statuses: Array<{ raw: string; expected: string }> = [
      { raw: 'needs_response', expected: 'needs_response' },
      { raw: 'under_review', expected: 'under_review' },
      { raw: 'won', expected: 'won' },
      { raw: 'lost', expected: 'lost' },
      { raw: 'charge_refunded', expected: 'charge_refunded' },
    ]
    for (const { raw: rawStatus, expected } of statuses) {
      const raw: RawStripeDispute = {
        id: 'dp_s',
        object: 'dispute',
        amount: 100,
        currency: 'usd',
        status: rawStatus,
      }
      expect(transformDispute(raw).status).toBe(expected)
    }
  })

  it('maps known reason values', () => {
    const raw: RawStripeDispute = {
      id: 'dp_004',
      object: 'dispute',
      amount: 100,
      currency: 'usd',
      status: 'needs_response',
      reason: 'fraudulent',
    }
    expect(transformDispute(raw).reason).toBe('fraudulent')
    expect(() => DisputeSchema.parse(transformDispute(raw))).not.toThrow()
  })

  it('maps evidenceDueBy from unix timestamp', () => {
    const raw: RawStripeDispute = {
      id: 'dp_005',
      object: 'dispute',
      amount: 100,
      currency: 'usd',
      status: 'needs_response',
      evidence_details: { due_by: 1709251200 },
    }
    expect(transformDispute(raw).evidenceDueBy).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps createdAt from unix timestamp', () => {
    const raw: RawStripeDispute = {
      id: 'dp_006',
      object: 'dispute',
      amount: 100,
      currency: 'usd',
      status: 'needs_response',
      created: 1709251200,
    }
    expect(transformDispute(raw).createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(() => DisputeSchema.parse(transformDispute(raw))).not.toThrow()
  })
})
