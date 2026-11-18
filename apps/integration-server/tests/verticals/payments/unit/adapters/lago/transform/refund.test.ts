import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawLagoCreditNote,
} from '../../../../../../../src/verticals/payments/adapters/lago/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('lago transformRefund', () => {
  it('maps a succeeded credit note with lago_invoice_id as chargeId', () => {
    const raw: RawLagoCreditNote = {
      lago_id: 'cn-001',
      number: 'CN-2024-001',
      lago_invoice_id: 'inv-001',
      refund_status: 'succeeded',
      currency: 'usd',
      total_amount_cents: 2500,
      refund_amount_cents: 2500,
      reason: 'other',
      issuing_date: '2024-03-01',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('cn-001')
    expect(result.chargeId).toBe('inv-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('lago')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps reason "duplicated_charge" to "duplicate"', () => {
    const raw: RawLagoCreditNote = {
      lago_id: 'cn-002',
      lago_invoice_id: 'inv-002',
      refund_status: 'succeeded',
      reason: 'duplicated_charge',
      currency: 'EUR',
      total_amount_cents: 1000,
    }
    const result = transformRefund(raw)
    expect(result.reason).toBe('duplicate')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps reason "fraudulent_charge" to "fraudulent"', () => {
    const raw: RawLagoCreditNote = {
      lago_id: 'cn-003',
      lago_invoice_id: 'inv-003',
      refund_status: 'pending',
      reason: 'fraudulent_charge',
      currency: 'GBP',
      total_amount_cents: 5000,
    }
    const result = transformRefund(raw)
    expect(result.reason).toBe('fraudulent')
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a voided credit note to status "cancelled"', () => {
    const raw: RawLagoCreditNote = {
      lago_id: 'cn-004',
      credit_status: 'voided',
      currency: 'USD',
      total_amount_cents: 0,
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('cancelled')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
