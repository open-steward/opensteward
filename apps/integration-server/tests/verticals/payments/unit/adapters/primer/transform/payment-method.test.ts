import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawPrimerPaymentInstrument,
} from '../../../../../../../src/verticals/payments/adapters/primer/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('primer transformPaymentMethod', () => {
  it('maps PAYMENT_CARD to type "card" with card details', () => {
    const raw: RawPrimerPaymentInstrument = {
      token: 'pm_token_abc',
      analyticsId: 'analytics_xyz',
      customerId: 'cus_primer',
      paymentMethodType: 'PAYMENT_CARD',
      default: true,
      createdAt: '2024-03-01T00:00:00Z',
      paymentMethodData: {
        last4Digits: '4242',
        expirationMonth: 12,
        expirationYear: 2026,
        cardholderName: 'Alice Smith',
        network: 'VISA',
      },
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('card')
    expect(result.id).toBe('pm_token_abc')
    expect(result.customerId).toBe('cus_primer')
    expect(result.last4).toBe('4242')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2026)
    expect(result.holderName).toBe('Alice Smith')
    expect(result.brand).toBe('visa')
    expect(result.isDefault).toBe(true)
    expect(result.fingerprint).toBe('analytics_xyz')
    expect(result.gateway).toBe('primer')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps PAYPAL to type "wallet"', () => {
    const raw: RawPrimerPaymentInstrument = {
      token: 'pm_paypal',
      paymentMethodType: 'PAYPAL',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps KLARNA to type "bnpl"', () => {
    const raw: RawPrimerPaymentInstrument = {
      token: 'pm_klarna',
      paymentMethodType: 'KLARNA',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bnpl')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps ACH to type "bank_account"', () => {
    const raw: RawPrimerPaymentInstrument = {
      token: 'pm_ach',
      paymentMethodType: 'ACH',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bank_account')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps unknown paymentMethodType to "other"', () => {
    const raw: RawPrimerPaymentInstrument = {
      token: 'pm_other',
      paymentMethodType: 'SOME_UNKNOWN',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('other')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('falls back id to analyticsId when token is absent', () => {
    const raw: RawPrimerPaymentInstrument = {
      analyticsId: 'only_analytics',
      paymentMethodType: 'PAYMENT_CARD',
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('only_analytics')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
