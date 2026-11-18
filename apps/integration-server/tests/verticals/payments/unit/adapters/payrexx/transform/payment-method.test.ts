import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawPayrexxPaymentMethod,
} from '../../../../../../../src/verticals/payments/adapters/payrexx/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('payrexx transformPaymentMethod', () => {
  it('maps a visa card payment method', () => {
    const raw: RawPayrexxPaymentMethod = {
      name: 'visa',
      label: { en: 'Visa', de: 'Visa' },
    }

    const result = transformPaymentMethod(raw)

    expect(result.id).toBe('visa')
    expect(result.externalId).toBe('visa')
    expect(result.type).toBe('card')
    expect(result.brand).toBe('Visa')
    expect(result.gateway).toBe('payrexx')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a paypal payment method to wallet type', () => {
    const raw: RawPayrexxPaymentMethod = {
      name: 'paypal',
      label: { en: 'PayPal' },
    }

    const result = transformPaymentMethod(raw)

    expect(result.type).toBe('wallet')
    expect(result.id).toBe('paypal')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a sepa/bank transfer to bank_account type', () => {
    const raw: RawPayrexxPaymentMethod = {
      name: 'sepa',
      label: { de: 'SEPA Überweisung' },
    }

    const result = transformPaymentMethod(raw)

    expect(result.type).toBe('bank_account')
    expect(result.brand).toBe('SEPA Überweisung')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps an unknown payment method to other type', () => {
    const raw: RawPayrexxPaymentMethod = {
      name: 'crypto_pay',
      label: { en: 'Crypto Pay' },
    }

    const result = transformPaymentMethod(raw)

    expect(result.type).toBe('other')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
