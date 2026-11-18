import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawHyperswitchDispute,
} from '../../../../../../../src/verticals/payments/adapters/hyperswitch/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('hyperswitch transformDispute', () => {
  it('maps dispute_opened to "needs_response" and parses string amount', () => {
    const raw: RawHyperswitchDispute = {
      dispute_id: 'dp_001',
      payment_id: 'pay_001',
      amount: '5000',
      currency: 'USD',
      dispute_status: 'dispute_opened',
      dispute_stage: 'chargeback',
      connector: 'stripe',
      challenge_required_by: '2024-03-15T00:00:00Z',
      created_at: '2024-03-01T00:00:00Z',
      connector_updated_at: '2024-03-01T00:00:00Z',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('needs_response')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.chargeId).toBe('pay_001')
    expect(result.evidenceDueBy).toMatch(/^2024-03-15T00:00:00/)
    expect(result.gateway).toBe('hyperswitch')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps dispute_won to "won"', () => {
    const raw: RawHyperswitchDispute = {
      dispute_id: 'dp_002',
      payment_id: 'pay_002',
      amount: '10000',
      currency: 'EUR',
      dispute_status: 'dispute_won',
      created_at: '2024-03-01T00:00:00Z',
      connector_updated_at: '2024-03-02T00:00:00Z',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('won')
    expect(result.amount).toBe(10000)
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps dispute_challenged to "under_review"', () => {
    const raw: RawHyperswitchDispute = {
      dispute_id: 'dp_003',
      payment_id: 'pay_003',
      amount: '2500',
      currency: 'GBP',
      dispute_status: 'dispute_challenged',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('under_review')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('defaults to 0 for non-numeric amount string', () => {
    const raw: RawHyperswitchDispute = {
      dispute_id: 'dp_004',
      payment_id: 'pay_004',
      amount: 'invalid',
      currency: 'USD',
      dispute_status: 'dispute_lost',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('lost')
    expect(result.amount).toBe(0)
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
