import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawPaystackRefund,
} from '../../../../../../../src/verticals/payments/adapters/paystack/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('paystack transformRefund', () => {
  it('maps a processed refund to status "succeeded"', () => {
    const raw: RawPaystackRefund = {
      id: 77,
      transaction: { id: 555, reference: 'TXN_ref_parent' },
      amount: 10000,
      currency: 'NGN',
      status: 'processed',
      refunded_at: '2024-03-01T00:00:00Z',
      created_at: '2024-03-01T00:00:00Z',
      customer_note: 'Customer requested refund',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('NGN')
    expect(result.chargeId).toBe('TXN_ref_parent')
    expect(result.gateway).toBe('paystack')
    expect(result.id).toBe('77')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a non-processed status to "pending"', () => {
    const raw: RawPaystackRefund = {
      id: 88,
      transaction: { id: 666, reference: 'TXN_ref_parent2' },
      amount: 5000,
      currency: 'NGN',
      status: 'pending',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(result.chargeId).toBe('TXN_ref_parent2')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back chargeId to transaction.id when reference absent', () => {
    const raw: RawPaystackRefund = {
      id: 99,
      transaction: { id: 777 },
      amount: 2000,
      currency: 'NGN',
      status: 'processed',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.chargeId).toBe('777')
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('handles a numeric transaction id (not object)', () => {
    const raw: RawPaystackRefund = {
      id: 100,
      transaction: 888,
      amount: 3000,
      currency: 'NGN',
      status: 'pending',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.chargeId).toBe('888')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
