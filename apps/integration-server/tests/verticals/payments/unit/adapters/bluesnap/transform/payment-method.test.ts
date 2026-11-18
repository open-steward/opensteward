import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  transformPaymentMethodsFromShopper,
  type RawBluesnapCreditCardInfo,
} from '../../../../../../../src/verticals/payments/adapters/bluesnap/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('bluesnap transformPaymentMethod', () => {
  it('maps a credit card info entry to a canonical payment method', () => {
    const info: RawBluesnapCreditCardInfo = {
      cardLastFourDigits: '4242',
      cardType: 'VISA',
      expirationMonth: 12,
      expirationYear: 2028,
      binNumber: '424242',
      isDefault: true,
    }
    const result = transformPaymentMethod(info, 'SHOPPER-001', 0)
    expect(result.id).toBe('SHOPPER-001-card-0')
    expect(result.type).toBe('card')
    expect(result.brand).toBe('visa')
    expect(result.last4).toBe('4242')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2028)
    expect(result.isDefault).toBe(true)
    expect(result.customerId).toBe('SHOPPER-001')
    expect(result.gateway).toBe('bluesnap')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('synthesises id from index when shopperId is absent', () => {
    const info: RawBluesnapCreditCardInfo = {
      cardLastFourDigits: '1234',
      cardType: 'MASTERCARD',
      expirationMonth: 6,
      expirationYear: 2026,
    }
    const result = transformPaymentMethod(info, undefined, 2)
    expect(result.id).toBe('card-2')
    expect(result.customerId).toBeUndefined()
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('defaults isDefault to true for index 0 when not set', () => {
    const info: RawBluesnapCreditCardInfo = {
      cardLastFourDigits: '9999',
      cardType: 'AMEX',
    }
    const result = transformPaymentMethod(info, 'SHOPPER-002', 0)
    expect(result.isDefault).toBe(true)
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('defaults isDefault to false for index > 0 when not set', () => {
    const info: RawBluesnapCreditCardInfo = {
      cardLastFourDigits: '8888',
      cardType: 'DISCOVER',
    }
    const result = transformPaymentMethod(info, 'SHOPPER-002', 1)
    expect(result.isDefault).toBe(false)
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})

describe('bluesnap transformPaymentMethodsFromShopper', () => {
  it('extracts multiple payment methods from a vaulted shopper', () => {
    const shopper = {
      vaultedShopperId: 'SHOPPER-010',
      paymentSources: {
        creditCardInfo: [
          { cardLastFourDigits: '4242', cardType: 'VISA', isDefault: true },
          { cardLastFourDigits: '1234', cardType: 'MASTERCARD' },
        ],
      },
    }
    const results = transformPaymentMethodsFromShopper(shopper as any)
    expect(results).toHaveLength(2)
    expect(results[0].id).toBe('SHOPPER-010-card-0')
    expect(results[1].id).toBe('SHOPPER-010-card-1')
    results.forEach((r) => expect(() => PaymentMethodSchema.parse(r)).not.toThrow())
  })
})
