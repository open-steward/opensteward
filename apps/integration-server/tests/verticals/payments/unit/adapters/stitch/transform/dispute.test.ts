import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawStripeDispute,
} from '../../../../../../../src/verticals/payments/adapters/stitch/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('stitch transformDispute', () => {
  it('maps id, amount, currency, and gateway fields', () => {
    const raw: RawStripeDispute = {
      id: 'dp_stitch_001',
      object: 'dispute',
      amount: 9900,
      currency: 'usd',
      status: 'needs_response',
      charge: 'ch_001',
    }
    const result = transformDispute(raw)
    expect(result.id).toBe('dp_stitch_001')
    expect(result.externalId).toBe('dp_stitch_001')
    expect(result.amount).toBe(9900)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('stripe')
  })

  it('upper-cases currency', () => {
    const raw: RawStripeDispute = {
      id: 'dp_stitch_002',
      object: 'dispute',
      amount: 5000,
      currency: 'eur',
      status: 'won',
      charge: 'ch_002',
    }
    const result = transformDispute(raw)
    expect(result.currency).toBe('EUR')
  })

  it('maps known status "won"', () => {
    const raw: RawStripeDispute = {
      id: 'dp_stitch_003',
      object: 'dispute',
      amount: 1000,
      currency: 'usd',
      status: 'won',
      charge: 'ch_003',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('won')
  })

  it('maps known status "lost"', () => {
    const raw: RawStripeDispute = {
      id: 'dp_stitch_004',
      object: 'dispute',
      amount: 1000,
      currency: 'usd',
      status: 'lost',
      charge: 'ch_004',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('lost')
  })

  it('maps reason "fraudulent" correctly', () => {
    const raw: RawStripeDispute = {
      id: 'dp_stitch_005',
      object: 'dispute',
      amount: 2000,
      currency: 'usd',
      status: 'needs_response',
      reason: 'fraudulent',
      charge: 'ch_005',
    }
    const result = transformDispute(raw)
    expect(result.reason).toBe('fraudulent')
  })

  it('maps reason "subscription_canceled" to "subscription_cancelled"', () => {
    const raw: RawStripeDispute = {
      id: 'dp_stitch_006',
      object: 'dispute',
      amount: 2000,
      currency: 'usd',
      status: 'needs_response',
      reason: 'subscription_canceled',
      charge: 'ch_006',
    }
    const result = transformDispute(raw)
    expect(result.reason).toBe('subscription_cancelled')
  })

  it('uses payment_intent as chargeId when charge is absent', () => {
    const raw: RawStripeDispute = {
      id: 'dp_stitch_007',
      object: 'dispute',
      amount: 3000,
      currency: 'usd',
      status: 'under_review',
      charge: null,
      payment_intent: 'pi_001',
    }
    const result = transformDispute(raw)
    expect(result.chargeId).toBe('pi_001')
  })

  it('converts evidenceDueBy from unix timestamp', () => {
    const raw: RawStripeDispute = {
      id: 'dp_stitch_008',
      object: 'dispute',
      amount: 1000,
      currency: 'usd',
      status: 'needs_response',
      charge: 'ch_008',
      evidence_details: { due_by: 1709251200 },
    }
    const result = transformDispute(raw)
    expect(result.evidenceDueBy).toBe('2024-03-01T00:00:00.000Z')
  })

  it('passes DisputeSchema validation', () => {
    const raw: RawStripeDispute = {
      id: 'dp_stitch_009',
      object: 'dispute',
      amount: 7500,
      currency: 'gbp',
      status: 'needs_response',
      reason: 'duplicate',
      charge: 'ch_009',
      network: 'visa',
      created: 1709251200,
      metadata: { caseRef: 'C-001' },
    }
    const result = transformDispute(raw)
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
