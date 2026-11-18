import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawUpaymentsRefund,
} from '../../../../../../../src/verticals/payments/adapters/upayments/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('upayments transformRefund', () => {
  it('maps "success" status to "succeeded" and converts amount to minor units', () => {
    const raw: RawUpaymentsRefund = {
      id: 'ref_001',
      chargeId: 'ch_001',
      status: 'success',
      amount: 10,
      currency: 'KWD',
      createdDate: '2024-03-01T12:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('ref_001')
    expect(result.externalId).toBe('ref_001')
    expect(result.chargeId).toBe('ch_001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(1000)
    expect(result.currency).toBe('KWD')
    expect(result.gateway).toBe('upayments')
    expect(result.createdAt).toBe('2024-03-01T12:00:00Z')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps "failed" status to "failed"', () => {
    const raw: RawUpaymentsRefund = {
      id: 'ref_002',
      chargeId: 'ch_002',
      status: 'failed',
      amount: 5,
      currency: 'USD',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.amount).toBe(500)
    expect(result.currency).toBe('USD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps "declined" status to "failed"', () => {
    const raw: RawUpaymentsRefund = {
      id: 'ref_003',
      chargeId: 'ch_003',
      status: 'declined',
      amount: 20,
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.currency).toBe('KWD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps "completed" status to "succeeded"', () => {
    const raw: RawUpaymentsRefund = {
      id: 'ref_004',
      chargeId: 'ch_004',
      status: 'completed',
      amount: 50,
      currency: 'AED',
      createdDate: '2024-07-20T09:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('AED')
    expect(result.createdAt).toBe('2024-07-20T09:00:00Z')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps "processed" status to "succeeded"', () => {
    const raw: RawUpaymentsRefund = {
      id: 'ref_005',
      chargeId: 'ch_005',
      status: 'processed',
      amount: 15,
      currency: 'SAR',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps unknown status to "pending"', () => {
    const raw: RawUpaymentsRefund = {
      id: 'ref_006',
      chargeId: 'ch_006',
      status: 'in_review',
      amount: 8,
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps missing status to "pending"', () => {
    const raw: RawUpaymentsRefund = {
      id: 'ref_007',
      chargeId: 'ch_007',
      amount: 3,
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to KWD when currency is missing', () => {
    const raw: RawUpaymentsRefund = {
      id: 'ref_008',
      chargeId: 'ch_008',
      status: 'success',
      amount: 100,
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('KWD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('uses metadata from metadata field when present', () => {
    const raw: RawUpaymentsRefund = {
      id: 'ref_009',
      chargeId: 'ch_009',
      status: 'success',
      amount: 10,
      metadata: { reason: 'customer_request', ref: 'xyz' },
    }
    const result = transformRefund(raw)
    expect(result.metadata).toEqual({ reason: 'customer_request', ref: 'xyz' })
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to extra field for metadata', () => {
    const raw: RawUpaymentsRefund = {
      id: 'ref_010',
      chargeId: 'ch_010',
      status: 'success',
      amount: 10,
      extra: { tag: 'promo' },
    }
    const result = transformRefund(raw)
    expect(result.metadata).toEqual({ tag: 'promo' })
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('handles missing chargeId gracefully', () => {
    const raw: RawUpaymentsRefund = {
      id: 'ref_011',
      status: 'success',
      amount: 5,
    }
    const result = transformRefund(raw)
    expect(result.chargeId).toBe('')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('omits createdAt when createdDate is null', () => {
    const raw: RawUpaymentsRefund = {
      id: 'ref_012',
      chargeId: 'ch_012',
      status: 'success',
      amount: 10,
      createdDate: null,
    }
    const result = transformRefund(raw)
    expect(result.createdAt).toBeUndefined()
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
