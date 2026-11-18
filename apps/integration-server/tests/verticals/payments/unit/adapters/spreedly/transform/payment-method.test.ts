import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawSpreedlyPaymentMethod,
} from '../../../../../../../src/verticals/payments/adapters/spreedly/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('spreedly transformPaymentMethod', () => {
  it('maps a credit card payment method', () => {
    const raw: RawSpreedlyPaymentMethod = {
      token: 'pm_spreedly_1',
      payment_method_type: 'credit_card',
      card_type: 'visa',
      last_four_digits: '4242',
      first_six_digits: '424242',
      month: 12,
      year: 2028,
      full_name: 'Alice Smith',
      fingerprint: 'fp_abc123',
      storage_state: 'retained',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('pm_spreedly_1')
    expect(result.type).toBe('card')
    expect(result.brand).toBe('visa')
    expect(result.last4).toBe('4242')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2028)
    expect(result.holderName).toBe('Alice Smith')
    expect(result.gateway).toBe('spreedly')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('composes holder name from first_name and last_name when full_name absent', () => {
    const raw: RawSpreedlyPaymentMethod = {
      token: 'pm_spreedly_2',
      payment_method_type: 'credit_card',
      first_name: 'Bob',
      last_name: 'Jones',
      last_four_digits: '1234',
      month: 6,
      year: 2026,
    }
    const result = transformPaymentMethod(raw)
    expect(result.holderName).toBe('Bob Jones')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a bank account type', () => {
    const raw: RawSpreedlyPaymentMethod = {
      token: 'pm_spreedly_3',
      payment_method_type: 'bank_account',
      bank_name: 'Chase Bank',
      last_four_digits: '6789',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bank_account')
    expect(result.bankName).toBe('Chase Bank')
    expect(result.last4).toBe('6789')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps an apple_pay type to wallet', () => {
    const raw: RawSpreedlyPaymentMethod = {
      token: 'pm_spreedly_4',
      payment_method_type: 'apple_pay',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('includes storage_state and first_six_digits in metadata', () => {
    const raw: RawSpreedlyPaymentMethod = {
      token: 'pm_spreedly_5',
      payment_method_type: 'credit_card',
      storage_state: 'retained',
      first_six_digits: '411111',
      month: 3,
      year: 2027,
    }
    const result = transformPaymentMethod(raw)
    expect(result.metadata['storage_state']).toBe('retained')
    expect(result.metadata['first_six_digits']).toBe('411111')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
