import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawTamaraRefund,
} from '../../../../../../../src/verticals/payments/adapters/tamara/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('tamara transformRefund', () => {
  it('maps a fully_refunded refund to status "succeeded" with correct amount', () => {
    const raw: RawTamaraRefund = {
      refund_id: 'ref-001',
      order_id: 'ord-001',
      status: 'fully_refunded',
      total_amount: { amount: '100.00', currency: 'SAR' },
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('SAR')
    expect(result.chargeId).toBe('ord-001')
    expect(result.gateway).toBe('tamara')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a partially_refunded refund to status "succeeded"', () => {
    const raw: RawTamaraRefund = {
      refund_id: 'ref-002',
      order_id: 'ord-002',
      status: 'partially_refunded',
      total_amount: { amount: '50.00', currency: 'AED' },
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.currency).toBe('AED')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a failed refund to status "failed"', () => {
    const raw: RawTamaraRefund = {
      refund_id: 'ref-003',
      order_id: 'ord-003',
      status: 'declined',
      total_amount: { amount: '25.00', currency: 'SAR' },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.id).toBe('ref-003')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to refunded_amount when total_amount is absent', () => {
    const raw: RawTamaraRefund = {
      refund_id: 'ref-004',
      order_id: 'ord-004',
      status: 'refunded',
      refunded_amount: { amount: '80.00', currency: 'SAR' },
    }
    const result = transformRefund(raw)
    expect(result.amount).toBe(8000)
    expect(result.currency).toBe('SAR')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('treats absent status as succeeded (refund endpoint convention)', () => {
    const raw: RawTamaraRefund = {
      refund_id: 'ref-005',
      order_id: 'ord-005',
      total_amount: { amount: '10.00', currency: 'SAR' },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
