import { describe, it, expect } from 'vitest'
import { transformRefund } from '../../../../../../../src/verticals/payments/adapters/rapyd/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('rapyd transformRefund', () => {
  it('maps a completed refund to canonical shape', () => {
    const raw = {
      id: 'refund_abc123',
      payment: 'payment_ch1',
      amount: 25.0,
      currency: 'USD',
      status: 'completed',
      reason: 'Customer request',
      receipt_number: '1042-0001',
      merchant_reference_id: 'ref_refund_01',
      created_at: 1_700_000_000,
      updated_at: 1_700_001_000,
      metadata: { note: 'refund approved' },
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('refund_abc123')
    expect(result.externalId).toBe('refund_abc123')
    expect(result.chargeId).toBe('payment_ch1')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.receiptNumber).toBe('1042-0001')
    expect(result.gateway).toBe('rapyd')
    expect(result.metadata.reason).toBe('Customer request')
    expect(result.metadata.merchant_reference_id).toBe('ref_refund_01')
    expect(result.metadata.note).toBe('refund approved')
    expect(result.createdAt).toMatch(/^2023-/)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a pending refund status correctly', () => {
    const raw = {
      id: 'refund_pending',
      payment: 'payment_ch2',
      amount: 10.0,
      currency: 'EUR',
      status: 'pending',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(1000)
    expect(result.currency).toBe('EUR')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a failed/rejected refund status correctly', () => {
    const raw = {
      id: 'refund_failed',
      payment: 'payment_ch3',
      amount: 50.0,
      currency: 'GBP',
      status: 'rejected',
      failure_reason: 'card_closed',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('card_closed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to currency_code when currency is absent', () => {
    const raw = {
      id: 'refund_cc',
      payment: 'payment_ch4',
      amount: 15.0,
      currency_code: 'CAD',
      status: 'completed',
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('CAD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
