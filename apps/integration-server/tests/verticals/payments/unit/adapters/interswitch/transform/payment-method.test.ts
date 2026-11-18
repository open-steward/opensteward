import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawStripePaymentMethod,
} from '../../../../../../../src/verticals/payments/adapters/interswitch/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('interswitch transformPaymentMethod', () => {
  it('maps a card payment method', () => {
    const raw: RawStripePaymentMethod = {
      id: 'pm-001',
      object: 'payment_method',
      type: 'card',
      customer: 'cust-001',
      card: {
        brand: 'visa',
        last4: '4242',
        exp_month: 12,
        exp_year: 2028,
        fingerprint: 'fp_abc',
      },
      billing_details: { name: 'Jane Doe' },
      created: 1709251200,
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('card')
    expect(result.last4).toBe('4242')
    expect(result.brand).toBe('visa')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2028)
    expect(result.customerId).toBe('cust-001')
    expect(result.gateway).toBe('stripe')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a bank account payment method', () => {
    const raw: RawStripePaymentMethod = {
      id: 'pm-002',
      object: 'payment_method',
      type: 'us_bank_account',
      us_bank_account: { bank_name: 'Chase', last4: '6789', fingerprint: 'fp_bank' },
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bank_account')
    expect(result.last4).toBe('6789')
    expect(result.bankName).toBe('Chase')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
