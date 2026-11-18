import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawStripePaymentMethod,
} from '../../../../../../../src/verticals/payments/adapters/spoton/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('spoton transformPaymentMethod', () => {
  it('maps a card payment method', () => {
    const raw: RawStripePaymentMethod = {
      id: 'pm_spoton_1',
      object: 'payment_method',
      type: 'card',
      customer: 'cus_spoton_1',
      card: {
        brand: 'visa',
        last4: '4242',
        exp_month: 12,
        exp_year: 2028,
        fingerprint: 'fp_abc123',
      },
      billing_details: { name: 'Alice Smith' },
      created: 1709251200,
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('pm_spoton_1')
    expect(result.type).toBe('card')
    expect(result.last4).toBe('4242')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2028)
    expect(result.holderName).toBe('Alice Smith')
    expect(result.gateway).toBe('stripe')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a bank account payment method', () => {
    const raw: RawStripePaymentMethod = {
      id: 'pm_spoton_2',
      object: 'payment_method',
      type: 'us_bank_account',
      us_bank_account: {
        bank_name: 'Chase',
        last4: '6789',
        fingerprint: 'fp_bank1',
      },
      created: 1709251200,
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bank_account')
    expect(result.last4).toBe('6789')
    expect(result.bankName).toBe('Chase')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a wallet type', () => {
    const raw: RawStripePaymentMethod = {
      id: 'pm_spoton_3',
      object: 'payment_method',
      type: 'apple_pay',
      created: 1709251200,
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
