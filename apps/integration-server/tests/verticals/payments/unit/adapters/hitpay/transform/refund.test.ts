import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawHitpayRefund,
} from '../../../../../../../src/verticals/payments/adapters/hitpay/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('hitpay transformRefund', () => {
  it('maps a succeeded refund with correct amount in minor units', () => {
    const raw: RawHitpayRefund = {
      id: 'ref-001',
      payment_id: 'pay-001',
      amount_refunded: '25.00',
      total_amount: '50.00',
      currency: 'SGD',
      status: 'succeeded',
      payment_method: 'paynow_online',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('SGD')
    expect(result.chargeId).toBe('pay-001')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('hitpay')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps null status to "pending"', () => {
    const raw: RawHitpayRefund = {
      id: 'ref-002',
      payment_id: 'pay-002',
      amount_refunded: '10.00',
      currency: 'SGD',
      status: null,
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps "refunded" status to "succeeded"', () => {
    const raw: RawHitpayRefund = {
      id: 'ref-003',
      payment_id: 'pay-003',
      amount_refunded: '5.00',
      currency: 'USD',
      status: 'refunded',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.currency).toBe('USD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
