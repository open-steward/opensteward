import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawDokuRefund,
} from '../../../../../../../src/verticals/payments/adapters/doku/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('doku transformRefund', () => {
  it('maps a SUCCESS refund with invoice_number as chargeId', () => {
    const raw: RawDokuRefund = {
      order: { invoice_number: 'INV-001', amount: 100000, currency: 'IDR' },
      transaction: {
        status: 'SUCCESS',
        date: '2024-03-01T00:00:00Z',
        original_request_id: 'req_001',
      },
      refund: {
        id: 'ref_001',
        amount: 50000,
        status: 'SUCCESS',
        reason: 'Customer request',
        date: '2024-03-01T00:00:00Z',
      },
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('ref_001')
    expect(result.externalId).toBe('ref_001')
    expect(result.chargeId).toBe('INV-001')
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe('IDR')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('doku')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps PENDING refund status to "pending"', () => {
    const raw: RawDokuRefund = {
      order: { invoice_number: 'INV-002', currency: 'IDR' },
      transaction: { date: '2024-03-01T00:00:00Z' },
      refund: {
        id: 'ref_002',
        amount: 25000,
        status: 'PENDING',
        date: '2024-03-01T00:00:00Z',
      },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps FAILED refund status to "failed"', () => {
    const raw: RawDokuRefund = {
      order: { invoice_number: 'INV-003', currency: 'IDR' },
      transaction: { date: '2024-03-01T00:00:00Z' },
      refund: { id: 'ref_003', amount: 10000, status: 'FAILED', date: '2024-03-01T00:00:00Z' },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('uses fallback chargeId and amount when order fields are absent', () => {
    const raw: RawDokuRefund = {
      transaction: { original_request_id: 'req_fallback', date: '2024-03-01T00:00:00Z' },
      refund: { original_request_id: 'ref_fb' },
    }
    const result = transformRefund(raw, { chargeId: 'pay_fallback', amount: 9999 })
    expect(result.chargeId).toBe('pay_fallback')
    expect(result.amount).toBe(9999)
    expect(result.id).toBe('ref_fb')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps CANCELLED/VOID refund status', () => {
    const raw: RawDokuRefund = {
      order: { invoice_number: 'INV-005', currency: 'IDR' },
      transaction: { date: '2024-03-01T00:00:00Z' },
      refund: { id: 'ref_005', amount: 5000, status: 'CANCELLED', date: '2024-03-01T00:00:00Z' },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('cancelled')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
