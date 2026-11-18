import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawHitpayPaymentRequest,
} from '../../../../../../../src/verticals/payments/adapters/hitpay/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('hitpay transformCharge', () => {
  it('maps a completed payment request to status "succeeded" with correct amount in minor units', () => {
    const raw: RawHitpayPaymentRequest = {
      id: 'pr-001',
      status: 'completed',
      amount: '50.00',
      currency: 'SGD',
      purpose: 'Order #99',
      email: 'buyer@example.com',
      url: 'https://pay.hit.pay/pr-001',
      payments: [
        {
          id: 'pay-001',
          status: 'succeeded',
          buyer_email: 'buyer@example.com',
          currency: 'SGD',
          amount: '50.00',
          refunded_amount: '0.00',
          payment_type: 'paynow_online',
          created_at: '2024-03-01T00:00:00Z',
        },
      ],
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('SGD')
    expect(result.gateway).toBe('hitpay')
    expect(result.captured).toBe(true)
    expect(result.paymentMethodId).toBe('pay-001')
    expect(result.description).toBe('Order #99')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a pending payment request to status "pending" with no capturedAt', () => {
    const raw: RawHitpayPaymentRequest = {
      id: 'pr-002',
      status: 'pending',
      amount: '20.00',
      currency: 'SGD',
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(2000)
    expect(result.captured).toBe(false)
    expect(result.capturedAt).toBeUndefined()
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an expired payment request to status "cancelled"', () => {
    const raw: RawHitpayPaymentRequest = {
      id: 'pr-003',
      status: 'expired',
      amount: '10.00',
      currency: 'USD',
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(result.currency).toBe('USD')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to SGD when not provided', () => {
    const raw: RawHitpayPaymentRequest = {
      id: 'pr-004',
      status: 'pending',
      amount: '5.00',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.currency).toBe('SGD')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
