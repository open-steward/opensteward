import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawHyperswitchPayment,
} from '../../../../../../../src/verticals/payments/adapters/hyperswitch/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('hyperswitch transformCharge', () => {
  it('maps a succeeded payment with integer minor units directly', () => {
    const raw: RawHyperswitchPayment = {
      payment_id: 'pay_001',
      merchant_id: 'merchant_acme',
      status: 'succeeded',
      amount: 5000,
      amount_received: 5000,
      currency: 'USD',
      customer_id: 'cus_001',
      customer: {
        id: 'cus_001',
        name: 'Jane Doe',
        email: 'jane@example.com',
      },
      payment_method: 'card',
      payment_method_id: 'pm_001',
      description: 'Invoice #42',
      statement_descriptor_name: 'ACME CORP',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.customerId).toBe('cus_001')
    expect(result.paymentMethodId).toBe('pm_001')
    expect(result.statementDescriptor).toBe('ACME CORP')
    expect(result.receiptEmail).toBe('jane@example.com')
    expect(result.gateway).toBe('hyperswitch')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a failed payment with error info', () => {
    const raw: RawHyperswitchPayment = {
      payment_id: 'pay_002',
      status: 'failed',
      amount: 1000,
      currency: 'EUR',
      error_code: 'card_declined',
      error_message: 'Your card was declined',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('card_declined')
    expect(result.failureMessage).toBe('Your card was declined')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps cancelled/expired statuses to "cancelled"', () => {
    const raw: RawHyperswitchPayment = {
      payment_id: 'pay_003',
      status: 'cancelled',
      amount: 2000,
      currency: 'GBP',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps processing/requires_* statuses to "pending"', () => {
    const raw: RawHyperswitchPayment = {
      payment_id: 'pay_004',
      status: 'requires_customer_action',
      amount: 3000,
      currency: 'USD',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
