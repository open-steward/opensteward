import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawMyfatoorahRefund,
} from '../../../../../../../src/verticals/payments/adapters/myfatoorah/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('myfatoorah transformRefund', () => {
  it('maps a successful refund with all fields', () => {
    const raw: RawMyfatoorahRefund = {
      RefundId: 'REFD-001',
      InvoiceId: 'INV-001',
      Amount: 25.0,
      currency: 'KWD',
      RefundStatus: 'success',
      CreatedDate: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('REFD-001')
    expect(result.externalId).toBe('REFD-001')
    expect(result.chargeId).toBe('INV-001')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('KWD')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('myfatoorah')
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a failed refund', () => {
    const raw: RawMyfatoorahRefund = {
      RefundId: 'REFD-002',
      InvoiceId: 'INV-002',
      Amount: 10.0,
      currency: 'SAR',
      RefundStatus: 'failed',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.currency).toBe('SAR')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a completed refund to "succeeded"', () => {
    const raw: RawMyfatoorahRefund = {
      RefundId: 'REFD-003',
      InvoiceId: 'INV-003',
      Amount: 5.0,
      currency: 'KWD',
      RefundStatus: 'completed',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults to pending for unknown status', () => {
    const raw: RawMyfatoorahRefund = {
      RefundId: 'REFD-004',
      InvoiceId: 'INV-004',
      Amount: 15.0,
      currency: 'KWD',
      RefundStatus: 'under_review',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to KWD when missing', () => {
    const raw: RawMyfatoorahRefund = {
      RefundId: 'REFD-005',
      InvoiceId: 'INV-005',
      Amount: 8.0,
      RefundStatus: 'succeeded',
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('KWD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
