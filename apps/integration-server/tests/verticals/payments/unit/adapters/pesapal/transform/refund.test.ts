import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawPesapalRefund,
} from '../../../../../../../src/verticals/payments/adapters/pesapal/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('pesapal transformRefund', () => {
  it('maps a successful refund (major units → minor units)', () => {
    const raw: RawPesapalRefund = {
      refund_id: 'pesapal-ref-001',
      order_tracking_id: 'pesapal-ord-001',
      amount: 50.0,
      currency: 'KES',
      status: 'success',
      created_date: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('pesapal-ref-001')
    expect(result.externalId).toBe('pesapal-ref-001')
    expect(result.chargeId).toBe('pesapal-ord-001')
    // toMinorUnits(50.00) = Math.round(50.00 * 100) = 5000
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('KES')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('pesapal')
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a failed refund correctly', () => {
    const raw: RawPesapalRefund = {
      refund_id: 'pesapal-ref-002',
      order_tracking_id: 'pesapal-ord-002',
      amount: 10.0,
      currency: 'KES',
      status: 'failed',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.amount).toBe(1000)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps unknown status to pending', () => {
    const raw: RawPesapalRefund = {
      refund_id: 'pesapal-ref-003',
      order_tracking_id: 'pesapal-ord-003',
      amount: 5.0,
      currency: 'KES',
      status: 'initiated',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to KES when currency is missing', () => {
    const raw: RawPesapalRefund = {
      refund_id: 'pesapal-ref-004',
      order_tracking_id: 'pesapal-ord-004',
      amount: 1.0,
      status: 'completed',
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('KES')
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
