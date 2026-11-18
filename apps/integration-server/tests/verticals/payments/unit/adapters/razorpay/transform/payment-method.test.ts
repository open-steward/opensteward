import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawRazorpayToken,
} from '../../../../../../../src/verticals/payments/adapters/razorpay/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('razorpay transformPaymentMethod', () => {
  it('maps a card token to card type with correct brand and last4', () => {
    const raw: RawRazorpayToken = {
      id: 'token_1',
      method: 'card',
      customer_id: 'cust_abc',
      card: {
        name: 'Jane Doe',
        last4: '4242',
        network: 'Visa',
        type: 'credit',
        expiry_month: 12,
        expiry_year: 2028,
      },
      status: 'active',
      created_at: 1_700_000_000,
    }
    const result = transformPaymentMethod(raw)

    expect(result.id).toBe('token_1')
    expect(result.type).toBe('card')
    expect(result.brand).toBe('Visa')
    expect(result.last4).toBe('4242')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2028)
    expect(result.holderName).toBe('Jane Doe')
    expect(result.customerId).toBe('cust_abc')
    expect(result.gateway).toBe('razorpay')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a UPI token to a2a type with fallback customerId', () => {
    const raw: RawRazorpayToken = {
      id: 'token_2',
      method: 'upi',
      vpa: 'user@upi',
      status: 'active',
      created_at: 1_700_000_000,
    }
    const result = transformPaymentMethod(raw, 'cust_fallback')

    expect(result.type).toBe('a2a')
    expect(result.customerId).toBe('cust_fallback')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a wallet token to wallet type', () => {
    const raw: RawRazorpayToken = {
      id: 'token_3',
      method: 'wallet',
      wallet: 'paytm',
      customer_id: 'cust_xyz',
      created_at: 1_700_000_000,
    }
    const result = transformPaymentMethod(raw)

    expect(result.type).toBe('wallet')
    expect(result.brand).toBe('paytm')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
