import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawCheckoutDispute,
} from '../../../../../../../src/verticals/payments/adapters/checkout-com/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('checkout-com transformDispute', () => {
  it('maps an evidence_required dispute to status "needs_response"', () => {
    const raw: RawCheckoutDispute = {
      id: 'dsp_001',
      status: 'evidence_required',
      amount: 5000,
      currency: 'usd',
      payment_id: 'pay_001',
      reason_code: '4853',
      category: 'fraudulent',
      evidence_required_by: '2024-03-15T00:00:00Z',
      received_on: '2024-03-01T00:00:00Z',
    }
    const result = transformDispute(raw)
    expect(result.id).toBe('dsp_001')
    expect(result.status).toBe('needs_response')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.chargeId).toBe('pay_001')
    expect(result.reason).toBe('fraudulent')
    expect(result.evidenceDueBy).toBe('2024-03-15T00:00:00Z')
    expect(result.gateway).toBe('checkout-com')
    expect(result.metadata.reason_code).toBe('4853')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps an evidence_under_review dispute to "under_review"', () => {
    const raw: RawCheckoutDispute = {
      id: 'dsp_002',
      status: 'evidence_under_review',
      amount: 2000,
      currency: 'eur',
      payment_id: 'pay_002',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('under_review')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps a won dispute to status "won"', () => {
    const raw: RawCheckoutDispute = {
      id: 'dsp_003',
      status: 'won',
      amount: 3000,
      currency: 'gbp',
      payment_id: 'pay_003',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('won')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps a lost dispute to status "lost"', () => {
    const raw: RawCheckoutDispute = {
      id: 'dsp_004',
      status: 'lost',
      amount: 1500,
      currency: 'usd',
      payment_id: 'pay_004',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('lost')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps category "not_received" to reason "product_not_received"', () => {
    const raw: RawCheckoutDispute = {
      id: 'dsp_005',
      status: 'evidence_required',
      amount: 800,
      currency: 'usd',
      payment_id: 'pay_005',
      category: 'not_received',
    }
    const result = transformDispute(raw)
    expect(result.reason).toBe('product_not_received')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps category "duplicate" to reason "duplicate"', () => {
    const raw: RawCheckoutDispute = {
      id: 'dsp_006',
      status: 'evidence_required',
      amount: 600,
      currency: 'usd',
      payment_id: 'pay_006',
      category: 'duplicate',
    }
    const result = transformDispute(raw)
    expect(result.reason).toBe('duplicate')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps accepted status to "lost"', () => {
    const raw: RawCheckoutDispute = {
      id: 'dsp_007',
      status: 'accepted',
      amount: 900,
      currency: 'usd',
      payment_id: 'pay_007',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('lost')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
