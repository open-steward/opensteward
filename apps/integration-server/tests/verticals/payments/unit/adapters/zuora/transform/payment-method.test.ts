import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawStripePaymentMethod,
} from '../../../../../../../src/verticals/payments/adapters/zuora/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('zuora transformPaymentMethod', () => {
  it('maps card type with brand and last4', () => {
    const raw: RawStripePaymentMethod = {
      id: 'zuora-pm-001',
      object: 'payment_method',
      type: 'card',
      customer: 'cus-zuora-01',
      card: {
        brand: 'mastercard',
        last4: '5555',
        exp_month: 6,
        exp_year: 2027,
        fingerprint: 'fp-zuora',
      },
      created: 1709251200,
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('zuora-pm-001')
    expect(result.type).toBe('card')
    expect(result.brand).toBe('mastercard')
    expect(result.last4).toBe('5555')
    expect(result.customerId).toBe('cus-zuora-01')
    expect(result.gateway).toBe('stripe')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps bank_account type for sepa_debit', () => {
    const raw: RawStripePaymentMethod = {
      id: 'zuora-pm-002',
      object: 'payment_method',
      type: 'sepa_debit',
      sepa_debit: { last4: '1234', fingerprint: 'fp-sepa' },
      created: 1709251200,
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bank_account')
    expect(result.last4).toBe('1234')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps wallet type for apple_pay', () => {
    const raw: RawStripePaymentMethod = {
      id: 'zuora-pm-003',
      object: 'payment_method',
      type: 'apple_pay',
      created: 1709251200,
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
