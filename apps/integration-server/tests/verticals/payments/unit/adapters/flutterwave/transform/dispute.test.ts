import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawFlutterwaveChargeback,
} from '../../../../../../../src/verticals/payments/adapters/flutterwave/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('flutterwave transformDispute', () => {
  it('maps a "won" chargeback to status "won"', () => {
    const raw: RawFlutterwaveChargeback = {
      id: 1001,
      amount: 50.0,
      flw_ref: 'FLW-001',
      status: 'won',
      currency: 'NGN',
      transaction_id: 12345,
      due_date: '2024-03-15T00:00:00Z',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformDispute(raw)
    expect(result.id).toBe('1001')
    expect(result.status).toBe('won')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('NGN')
    expect(result.chargeId).toBe('12345')
    expect(result.reason).toBe('general')
    expect(result.evidenceDueBy).toBe('2024-03-15T00:00:00Z')
    expect(result.gateway).toBe('flutterwave')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps a "lost" chargeback to status "lost"', () => {
    const raw: RawFlutterwaveChargeback = {
      id: 1002,
      amount: 30.0,
      status: 'lost',
      currency: 'USD',
      transaction_id: 12346,
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('lost')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps an "accepted" chargeback to status "charge_refunded"', () => {
    const raw: RawFlutterwaveChargeback = {
      id: 1003,
      amount: 20.0,
      status: 'accepted',
      currency: 'NGN',
      transaction_id: 12347,
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('charge_refunded')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps "pending" + "pre-arbitration" stage to "under_review"', () => {
    const raw: RawFlutterwaveChargeback = {
      id: 1004,
      amount: 75.0,
      status: 'pending',
      stage: 'pre-arbitration',
      currency: 'NGN',
      transaction_id: 12348,
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('under_review')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps "pending" without arbitration stage to "needs_response"', () => {
    const raw: RawFlutterwaveChargeback = {
      id: 1005,
      amount: 40.0,
      status: 'pending',
      currency: 'NGN',
      transaction_id: 12349,
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('needs_response')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps "resolved" to "won"', () => {
    const raw: RawFlutterwaveChargeback = {
      id: 1006,
      amount: 60.0,
      status: 'resolved',
      currency: 'USD',
      transaction_id: 12350,
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('won')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('falls back to flw_ref for chargeId when transaction_id is absent', () => {
    const raw: RawFlutterwaveChargeback = {
      id: 1007,
      amount: 10.0,
      status: 'pending',
      flw_ref: 'FLW-FALLBACK',
      currency: 'NGN',
    }
    const result = transformDispute(raw)
    expect(result.chargeId).toBe('FLW-FALLBACK')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
