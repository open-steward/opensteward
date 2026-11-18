import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawMxRefund,
} from '../../../../../../../src/verticals/payments/adapters/mx/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('mx transformRefund', () => {
  it('maps a successful refund with all fields', () => {
    const raw: RawMxRefund = {
      guid: 'REF-001',
      transaction_guid: 'TRN-001',
      amount: 25.0,
      currency: 'USD',
      status: 'succeeded',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('REF-001')
    expect(result.externalId).toBe('REF-001')
    expect(result.chargeId).toBe('TRN-001')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('mx')
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a failed refund', () => {
    const raw: RawMxRefund = {
      guid: 'REF-002',
      transaction_guid: 'TRN-002',
      amount: 10.0,
      currency: 'EUR',
      status: 'failed',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.currency).toBe('EUR')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a completed refund to "succeeded"', () => {
    const raw: RawMxRefund = {
      guid: 'REF-003',
      transaction_guid: 'TRN-003',
      amount: 5.0,
      currency: 'USD',
      status: 'completed',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults to pending for unknown status', () => {
    const raw: RawMxRefund = {
      guid: 'REF-004',
      transaction_guid: 'TRN-004',
      amount: 15.0,
      currency: 'USD',
      status: 'under_review',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to USD when missing', () => {
    const raw: RawMxRefund = {
      guid: 'REF-005',
      transaction_guid: 'TRN-005',
      amount: 8.0,
      status: 'processed',
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
