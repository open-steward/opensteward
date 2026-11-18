import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawStripePaymentMethod,
} from '../../../../../../../src/verticals/payments/adapters/payoneer/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('payoneer transformPaymentMethod', () => {
  it('maps a card payment method', () => {
    const raw: RawStripePaymentMethod = {
      id: 'pm_001',
      object: 'payment_method',
      type: 'card',
      customer: 'cus_001',
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

    expect(result.id).toBe('pm_001')
    expect(result.type).toBe('card')
    expect(result.customerId).toBe('cus_001')
    expect(result.last4).toBe('4242')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2028)
    expect(result.holderName).toBe('Jane Doe')
    expect(result.gateway).toBe('stripe')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a bank account (sepa_debit) payment method', () => {
    const raw: RawStripePaymentMethod = {
      id: 'pm_002',
      object: 'payment_method',
      type: 'sepa_debit',
      customer: 'cus_002',
      sepa_debit: { last4: '3456', fingerprint: 'fp_xyz' },
      created: 1709251200,
    }

    const result = transformPaymentMethod(raw)

    expect(result.type).toBe('bank_account')
    expect(result.last4).toBe('3456')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a klarna payment method to bnpl type', () => {
    const raw: RawStripePaymentMethod = {
      id: 'pm_003',
      object: 'payment_method',
      type: 'klarna',
      created: 1709251200,
    }

    const result = transformPaymentMethod(raw)

    expect(result.type).toBe('bnpl')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
