import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawGr4vyRefund,
} from '../../../../../../../src/verticals/payments/adapters/gr4vy/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('gr4vy transformRefund', () => {
  it('maps a succeeded refund with transaction_id as chargeId', () => {
    const raw: RawGr4vyRefund = {
      id: 'refund-001',
      transaction_id: 'txn-001',
      status: 'succeeded',
      currency: 'USD',
      amount: 5000,
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('refund-001')
    expect(result.chargeId).toBe('txn-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('gr4vy')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a failed refund to status "failed"', () => {
    const raw: RawGr4vyRefund = {
      id: 'refund-002',
      transaction_id: 'txn-002',
      status: 'failed',
      currency: 'EUR',
      amount: 2000,
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a declined refund to status "failed"', () => {
    const raw: RawGr4vyRefund = {
      id: 'refund-003',
      transaction_id: 'txn-003',
      status: 'declined',
      currency: 'GBP',
      amount: 1000,
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a voided refund to status "cancelled"', () => {
    const raw: RawGr4vyRefund = {
      id: 'refund-004',
      transaction_id: 'txn-004',
      status: 'voided',
      currency: 'AUD',
      amount: 3000,
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('cancelled')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('uses fallbackChargeId when transaction_id is absent', () => {
    const raw: RawGr4vyRefund = {
      id: 'refund-005',
      status: 'processing',
      currency: 'USD',
      amount: 500,
    }
    const result = transformRefund(raw, 'fallback-txn-005')
    expect(result.chargeId).toBe('fallback-txn-005')
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
