import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawBluesnapRefund,
} from '../../../../../../../src/verticals/payments/adapters/bluesnap/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('bluesnap transformRefund', () => {
  it('maps a refund entry to a "succeeded" refund with correct amount', () => {
    const raw: RawBluesnapRefund = {
      refundTransactionId: 'REFUND-001',
      transactionId: 'TXN-001',
      amount: 49.99,
      currency: 'USD',
      date: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('REFUND-001')
    expect(result.chargeId).toBe('TXN-001')
    expect(result.status).toBe('succeeded')
    // 49.99 → 4999 cents
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('bluesnap')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps reason "customer_request" to "requested_by_customer"', () => {
    const raw: RawBluesnapRefund = {
      refundTransactionId: 'REFUND-002',
      transactionId: 'TXN-002',
      amount: 20.0,
      currency: 'USD',
      reason: 'customer_request',
    }
    const result = transformRefund(raw)
    expect(result.reason).toBe('requested_by_customer')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps reason "fraudulent" to "fraudulent"', () => {
    const raw: RawBluesnapRefund = {
      refundTransactionId: 'REFUND-003',
      transactionId: 'TXN-003',
      amount: 15.0,
      currency: 'EUR',
      reason: 'fraudulent',
    }
    const result = transformRefund(raw)
    expect(result.reason).toBe('fraudulent')
    expect(result.currency).toBe('EUR')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps reason "duplicate" to "duplicate"', () => {
    const raw: RawBluesnapRefund = {
      refundTransactionId: 'REFUND-004',
      transactionId: 'TXN-004',
      amount: 30.0,
      currency: 'USD',
      reason: 'duplicate',
    }
    const result = transformRefund(raw)
    expect(result.reason).toBe('duplicate')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back id to transactionId when refundTransactionId is absent', () => {
    const raw: RawBluesnapRefund = {
      transactionId: 'TXN-005',
      amount: 10.0,
      currency: 'GBP',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('TXN-005')
    expect(result.chargeId).toBe('TXN-005')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps an unknown reason to "other"', () => {
    const raw: RawBluesnapRefund = {
      refundTransactionId: 'REFUND-006',
      transactionId: 'TXN-006',
      amount: 5.0,
      currency: 'USD',
      reason: 'some_unknown_reason',
    }
    const result = transformRefund(raw)
    expect(result.reason).toBe('other')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
