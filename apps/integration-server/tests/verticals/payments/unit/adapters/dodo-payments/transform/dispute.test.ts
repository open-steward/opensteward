import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawDodoDispute,
} from '../../../../../../../src/verticals/payments/adapters/dodo-payments/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('dodo-payments transformDispute', () => {
  it('maps dispute_opened to "needs_response"', () => {
    const raw: RawDodoDispute = {
      dispute_id: 'dp_001',
      payment_id: 'pay_001',
      business_id: 'biz_001',
      amount: 5000,
      currency: 'USD',
      dispute_status: 'dispute_opened',
      dispute_stage: 'dispute',
      created_at: '2024-03-01T00:00:00Z',
      payment_provider: 'visa',
    }
    const result = transformDispute(raw)
    expect(result.id).toBe('dp_001')
    expect(result.externalId).toBe('dp_001')
    expect(result.chargeId).toBe('pay_001')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('needs_response')
    expect(result.network).toBe('visa')
    expect(result.gateway).toBe('dodo-payments')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps dispute_won to "won"', () => {
    const raw: RawDodoDispute = {
      dispute_id: 'dp_002',
      payment_id: 'pay_002',
      amount: 3000,
      currency: 'USD',
      dispute_status: 'dispute_won',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('won')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps dispute_lost to "lost"', () => {
    const raw: RawDodoDispute = {
      dispute_id: 'dp_003',
      payment_id: 'pay_003',
      amount: 1000,
      currency: 'USD',
      dispute_status: 'dispute_lost',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('lost')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps dispute_challenged to "under_review"', () => {
    const raw: RawDodoDispute = {
      dispute_id: 'dp_004',
      payment_id: 'pay_004',
      amount: 2000,
      currency: 'USD',
      dispute_status: 'dispute_challenged',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('under_review')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('coerces string amount to integer', () => {
    const raw: RawDodoDispute = {
      dispute_id: 'dp_005',
      payment_id: 'pay_005',
      amount: '7500',
      currency: 'USD',
      dispute_status: 'dispute_accepted',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformDispute(raw)
    expect(result.amount).toBe(7500)
    expect(result.status).toBe('charge_refunded')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps dispute_expired to "warning_closed"', () => {
    const raw: RawDodoDispute = {
      dispute_id: 'dp_006',
      payment_id: 'pay_006',
      amount: 0,
      currency: 'USD',
      dispute_status: 'dispute_expired',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('warning_closed')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
