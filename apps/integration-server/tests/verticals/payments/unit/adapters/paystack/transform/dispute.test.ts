import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawPaystackDispute,
} from '../../../../../../../src/verticals/payments/adapters/paystack/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('paystack transformDispute', () => {
  it('maps a resolved merchant-accepted dispute to "won"', () => {
    const raw: RawPaystackDispute = {
      id: 55,
      currency: 'NGN',
      refund_amount: 5000,
      status: 'resolved',
      resolution: 'merchant-accepted',
      transaction: {
        id: 111,
        reference: 'TXN_ref_disp_001',
        amount: 5000,
        currency: 'NGN',
        created_at: '2024-03-01T00:00:00Z',
      },
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('won')
    expect(result.chargeId).toBe('TXN_ref_disp_001')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('NGN')
    expect(result.gateway).toBe('paystack')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps a resolved declined dispute to "lost"', () => {
    const raw: RawPaystackDispute = {
      id: 66,
      currency: 'NGN',
      refund_amount: 3000,
      status: 'resolved',
      resolution: 'declined',
      transaction: { id: 222, reference: 'TXN_ref_disp_002', amount: 3000 },
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('lost')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps a pending dispute to "needs_response"', () => {
    const raw: RawPaystackDispute = {
      id: 77,
      currency: 'NGN',
      status: 'pending',
      transaction: { id: 333, reference: 'TXN_ref_disp_003', amount: 2000 },
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('needs_response')
    expect(result.id).toBe('77')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps an under_review dispute correctly', () => {
    const raw: RawPaystackDispute = {
      id: 88,
      currency: 'NGN',
      status: 'under_review',
      transaction: { id: 444, reference: 'TXN_ref_disp_004', amount: 10000 },
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('under_review')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
