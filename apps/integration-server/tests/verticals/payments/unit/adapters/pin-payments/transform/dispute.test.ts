import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawPinDispute,
} from '../../../../../../../src/verticals/payments/adapters/pin-payments/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('pin-payments transformDispute', () => {
  it('maps status "evidence_required" to "needs_response" and extracts nested charge token', () => {
    const raw: RawPinDispute = {
      token: 'dis_abc123',
      charge: { token: 'ch_parent' },
      amount: 1500,
      currency: 'AUD',
      status: 'evidence_required',
      category: 'fraudulent',
      evidence_required_by: '2024-03-01T00:00:00Z',
      received_at: '2024-03-01T00:00:00Z',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('needs_response')
    expect(result.id).toBe('dis_abc123')
    expect(result.chargeId).toBe('ch_parent')
    expect(result.reason).toBe('fraudulent')
    expect(result.amount).toBe(1500)
    expect(result.currency).toBe('AUD')
    expect(result.gateway).toBe('pin-payments')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps status "won" to "won"', () => {
    const raw: RawPinDispute = {
      token: 'dis_won',
      charge_token: 'ch_won',
      amount: 500,
      status: 'won',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('won')
    expect(result.chargeId).toBe('ch_won')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps status "lost" to "lost"', () => {
    const raw: RawPinDispute = {
      token: 'dis_lost',
      status: 'lost',
      amount: 800,
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('lost')
    expect(result.currency).toBe('AUD')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps status "charge_refunded" to "charge_refunded"', () => {
    const raw: RawPinDispute = {
      token: 'dis_refunded',
      status: 'charge_refunded',
      amount: 200,
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('charge_refunded')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps category "product_not_received" to reason "product_not_received"', () => {
    const raw: RawPinDispute = {
      token: 'dis_pnr',
      status: 'evidence_required',
      category: 'product_not_received',
      amount: 400,
    }
    const result = transformDispute(raw)
    expect(result.reason).toBe('product_not_received')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
