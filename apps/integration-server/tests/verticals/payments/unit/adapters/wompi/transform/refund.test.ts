import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawWompiRefund,
} from '../../../../../../../src/verticals/payments/adapters/wompi/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('wompi transformRefund', () => {
  it('maps a successful refund with transaction_id as chargeId', () => {
    const raw: RawWompiRefund = {
      id: 'wompi-ref-001',
      transaction_id: 'wompi-tx-001',
      amount_in_cents: 15000,
      currency: 'COP',
      status: 'SUCCEEDED',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('wompi-ref-001')
    expect(result.chargeId).toBe('wompi-tx-001')
    expect(result.amount).toBe(15000)
    expect(result.currency).toBe('COP')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('wompi')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps FAILURE status to "failed"', () => {
    const raw: RawWompiRefund = {
      id: 'wompi-ref-002',
      transaction_id: 'wompi-tx-002',
      amount_in_cents: 5000,
      currency: 'COP',
      status: 'FAILURE',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps unknown status to "pending"', () => {
    const raw: RawWompiRefund = {
      id: 'wompi-ref-003',
      transaction_id: 'wompi-tx-003',
      amount_in_cents: 2000,
      currency: 'COP',
      status: 'PROCESSING',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to COP when missing', () => {
    const raw: RawWompiRefund = {
      id: 'wompi-ref-004',
      transaction_id: 'wompi-tx-004',
      amount_in_cents: 1000,
      status: 'completed',
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('COP')
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
