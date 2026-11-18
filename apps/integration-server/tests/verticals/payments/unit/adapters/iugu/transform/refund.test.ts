import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawIuguRefund,
} from '../../../../../../../src/verticals/payments/adapters/iugu/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('iugu transformRefund', () => {
  it('maps a completed refund to "succeeded"', () => {
    const raw: RawIuguRefund = {
      id: 'refund-001',
      invoice_id: 'inv-001',
      total_refunded_cents: 9900,
      currency: 'BRL',
      status: 'completed',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('refund-001')
    expect(result.chargeId).toBe('inv-001')
    expect(result.amount).toBe(9900)
    expect(result.currency).toBe('BRL')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('iugu')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps "succeeded" status directly', () => {
    const raw: RawIuguRefund = {
      id: 'refund-002',
      invoice_id: 'inv-002',
      total_refunded_cents: 5000,
      currency: 'BRL',
      status: 'succeeded',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps "failed" status correctly', () => {
    const raw: RawIuguRefund = {
      id: 'refund-003',
      invoice_id: 'inv-003',
      total_refunded_cents: 3000,
      currency: 'BRL',
      status: 'failed',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults to "pending" for unknown status', () => {
    const raw: RawIuguRefund = {
      id: 'refund-004',
      invoice_id: 'inv-004',
      total_refunded_cents: 1000,
      currency: 'BRL',
      status: 'processing',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to BRL when absent', () => {
    const raw: RawIuguRefund = {
      id: 'refund-005',
      invoice_id: 'inv-005',
      total_refunded_cents: 500,
      status: 'succeeded',
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('BRL')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
