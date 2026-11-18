import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawFlutterwaveRefund,
} from '../../../../../../../src/verticals/payments/adapters/flutterwave/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('flutterwave transformRefund', () => {
  it('maps a "completed" refund to status "succeeded"', () => {
    const raw: RawFlutterwaveRefund = {
      id: 501,
      tx_id: 12345,
      amount_refunded: 50.0,
      amount: 50.0,
      status: 'completed',
      currency: 'NGN',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('501')
    expect(result.chargeId).toBe('12345')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('NGN')
    expect(result.gateway).toBe('flutterwave')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a non-completed status to "pending"', () => {
    const raw: RawFlutterwaveRefund = {
      id: 502,
      tx_id: 12346,
      amount_refunded: 25.0,
      status: 'pending',
      currency: 'USD',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(2500)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('uses amount_refunded over amount when both present', () => {
    const raw: RawFlutterwaveRefund = {
      id: 503,
      tx_id: 12347,
      amount_refunded: 10.0,
      amount: 30.0,
      status: 'completed',
      currency: 'NGN',
    }
    const result = transformRefund(raw)
    expect(result.amount).toBe(1000)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to amount when amount_refunded is absent', () => {
    const raw: RawFlutterwaveRefund = {
      id: 504,
      tx_id: 12348,
      amount: 15.0,
      status: 'completed',
      currency: 'GHS',
    }
    const result = transformRefund(raw)
    expect(result.amount).toBe(1500)
    expect(result.currency).toBe('GHS')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
