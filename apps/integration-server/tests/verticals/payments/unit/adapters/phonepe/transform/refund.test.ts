import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawPhonepeRefund,
} from '../../../../../../../src/verticals/payments/adapters/phonepe/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('phonepe transformRefund', () => {
  // epoch-ms 1709251200000 = 2024-03-01T00:00:00.000Z
  const EPOCH_MS = 1709251200000

  it('maps a COMPLETED refund to status "succeeded"', () => {
    const raw: RawPhonepeRefund = {
      merchantRefundId: 'MERCH-REF-001',
      refundId: 'phonepe-ref-001',
      originalMerchantOrderId: 'MERCH-ORD-001',
      amount: 2500,
      state: 'COMPLETED',
      timestamp: EPOCH_MS,
    }
    const result = transformRefund(raw)
    // id from merchantRefundId
    expect(result.id).toBe('MERCH-REF-001')
    // externalId from refundId
    expect(result.externalId).toBe('phonepe-ref-001')
    expect(result.chargeId).toBe('MERCH-ORD-001')
    // amount already in paise (minor units) — toMinorUnits rounds only
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('INR')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('phonepe')
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a CONFIRMED refund to status "succeeded"', () => {
    const raw: RawPhonepeRefund = {
      merchantRefundId: 'MERCH-REF-002',
      refundId: 'phonepe-ref-002',
      originalMerchantOrderId: 'MERCH-ORD-002',
      amount: 1000,
      state: 'CONFIRMED',
      timestamp: EPOCH_MS,
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a FAILED refund with errorCode', () => {
    const raw: RawPhonepeRefund = {
      merchantRefundId: 'MERCH-REF-003',
      refundId: 'phonepe-ref-003',
      originalMerchantOrderId: 'MERCH-ORD-003',
      amount: 500,
      state: 'FAILED',
      errorCode: 'REFUND_FAILED',
      timestamp: EPOCH_MS,
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('REFUND_FAILED')
    expect(result.currency).toBe('INR')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps an in-progress refund to "pending"', () => {
    const raw: RawPhonepeRefund = {
      merchantRefundId: 'MERCH-REF-004',
      refundId: 'phonepe-ref-004',
      originalMerchantOrderId: 'MERCH-ORD-004',
      amount: 300,
      state: 'PENDING',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(result.createdAt).toBeUndefined()
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to refundId when merchantRefundId is absent', () => {
    const raw: RawPhonepeRefund = {
      refundId: 'phonepe-ref-005',
      originalMerchantOrderId: 'MERCH-ORD-005',
      amount: 100,
      state: 'COMPLETED',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('phonepe-ref-005')
    expect(result.externalId).toBe('phonepe-ref-005')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
