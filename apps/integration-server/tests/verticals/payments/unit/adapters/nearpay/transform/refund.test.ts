import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawNearpayRefund,
} from '../../../../../../../src/verticals/payments/adapters/nearpay/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('nearpay transformRefund', () => {
  it('maps a successful refund with all fields', () => {
    const raw: RawNearpayRefund = {
      uuid: 'ref-uuid-001',
      original_transaction_uuid: 'txn-uuid-001',
      amount_halalat: 2500,
      currency: 'SAR',
      status: 'success',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('ref-uuid-001')
    expect(result.externalId).toBe('ref-uuid-001')
    expect(result.chargeId).toBe('txn-uuid-001')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('SAR')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('nearpay')
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('does NOT multiply amount_halalat by 100 (safeInt passthrough)', () => {
    const raw: RawNearpayRefund = {
      uuid: 'ref-uuid-002',
      original_transaction_uuid: 'txn-uuid-002',
      amount_halalat: 500,
      currency: 'SAR',
      status: 'succeeded',
    }
    const result = transformRefund(raw)
    // safeInt: 500 stays 500, NOT 50000
    expect(result.amount).toBe(500)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a failed refund', () => {
    const raw: RawNearpayRefund = {
      uuid: 'ref-uuid-003',
      original_transaction_uuid: 'txn-uuid-003',
      amount_halalat: 1000,
      currency: 'SAR',
      status: 'failed',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps completed refund to "succeeded"', () => {
    const raw: RawNearpayRefund = {
      uuid: 'ref-uuid-004',
      original_transaction_uuid: 'txn-uuid-004',
      amount_halalat: 750,
      currency: 'SAR',
      status: 'completed',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults to pending for unknown status', () => {
    const raw: RawNearpayRefund = {
      uuid: 'ref-uuid-005',
      original_transaction_uuid: 'txn-uuid-005',
      amount_halalat: 300,
      currency: 'SAR',
      status: 'under_review',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to SAR when missing', () => {
    const raw: RawNearpayRefund = {
      uuid: 'ref-uuid-006',
      original_transaction_uuid: 'txn-uuid-006',
      amount_halalat: 200,
      status: 'processed',
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('SAR')
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
