import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawPaysafeRefund,
} from '../../../../../../../src/verticals/payments/adapters/paysafe/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('paysafe transformRefund', () => {
  it('maps a COMPLETED refund with settlementId as chargeId', () => {
    const raw: RawPaysafeRefund = {
      id: 'ref_001',
      merchantRefNum: 'refund-order-001',
      amount: 5000,
      currencyCode: 'USD',
      status: 'COMPLETED',
      settlementId: 'settle_001',
      txnTime: '2024-03-01T00:00:00Z',
      updatedTime: '2024-03-01T00:00:00Z',
    }

    const result = transformRefund(raw)

    expect(result.id).toBe('ref_001')
    expect(result.externalId).toBe('ref_001')
    expect(result.chargeId).toBe('settle_001')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('paysafe')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a FAILED refund with error message as failureReason', () => {
    const raw: RawPaysafeRefund = {
      id: 'ref_002',
      amount: 3000,
      currencyCode: 'EUR',
      status: 'FAILED',
      settlementId: 'settle_002',
      error: { code: 'ERR_001', message: 'Refund rejected' },
      txnTime: '2024-03-01T00:00:00Z',
    }

    const result = transformRefund(raw)

    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('Refund rejected')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a PENDING refund', () => {
    const raw: RawPaysafeRefund = {
      id: 'ref_003',
      amount: 1000,
      currencyCode: 'GBP',
      status: 'PENDING',
      settlementId: 'settle_003',
      txnTime: '2024-03-01T00:00:00Z',
    }

    const result = transformRefund(raw)

    expect(result.status).toBe('pending')
    expect(result.currency).toBe('GBP')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to merchantRefNum as chargeId when no settlementId', () => {
    const raw: RawPaysafeRefund = {
      id: 'ref_004',
      merchantRefNum: 'order-ref-fallback',
      amount: 2000,
      currencyCode: 'USD',
      status: 'RECEIVED',
      txnTime: '2024-03-01T00:00:00Z',
    }

    const result = transformRefund(raw)

    expect(result.chargeId).toBe('order-ref-fallback')
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
