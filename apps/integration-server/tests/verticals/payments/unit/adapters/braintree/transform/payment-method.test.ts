import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawBraintreePaymentMethod,
} from '../../../../../../../src/verticals/payments/adapters/braintree/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('braintree transformPaymentMethod', () => {
  it('maps a CreditCardDetails payment method to type "card"', () => {
    const raw: RawBraintreePaymentMethod = {
      id: 'pm_001',
      details: {
        __typename: 'CreditCardDetails',
        brandCode: 'Visa',
        last4: '1234',
        expirationMonth: '09',
        expirationYear: '2028',
        cardholderName: 'Alice Smith',
        bin: '411111',
        fingerprint: 'fp_abc123',
      },
      customer: { id: 'cust_001' },
      default: true,
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('pm_001')
    expect(result.type).toBe('card')
    expect(result.brand).toBe('visa')
    expect(result.last4).toBe('1234')
    expect(result.expMonth).toBe(9)
    expect(result.expYear).toBe(2028)
    expect(result.holderName).toBe('Alice Smith')
    expect(result.customerId).toBe('cust_001')
    expect(result.isDefault).toBe(true)
    expect(result.fingerprint).toBe('fp_abc123')
    expect(result.gateway).toBe('braintree')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a PayPalAccountDetails method to type "wallet"', () => {
    const raw: RawBraintreePaymentMethod = {
      id: 'pm_002',
      details: {
        __typename: 'PayPalAccountDetails',
        email: 'paypal@example.com',
      },
      customer: { id: 'cust_002' },
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a UsBankAccountDetails method to type "bank_account"', () => {
    const raw: RawBraintreePaymentMethod = {
      id: 'pm_003',
      details: {
        __typename: 'UsBankAccountDetails',
        last4: '6789',
      },
      customer: { id: 'cust_003' },
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bank_account')
    expect(result.last4).toBe('6789')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps an unknown typename to type "other"', () => {
    const raw: RawBraintreePaymentMethod = {
      id: 'pm_004',
      details: {
        __typename: 'SomeFuturePaymentMethod',
      },
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('other')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
