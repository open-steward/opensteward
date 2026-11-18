import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawAdyenStoredPaymentMethod,
} from '../../../../../../../src/verticals/payments/adapters/adyen/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('adyen transformPaymentMethod', () => {
  it('maps a card (scheme) stored payment method to type "card"', () => {
    const raw: RawAdyenStoredPaymentMethod = {
      id: 'PM-001',
      shopperReference: 'SHOPPER-1',
      type: 'scheme',
      brand: 'visa',
      lastFour: '4242',
      expiryMonth: '12',
      expiryYear: '2027',
      holderName: 'Jane Doe',
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('PM-001')
    expect(result.type).toBe('card')
    expect(result.brand).toBe('visa')
    expect(result.last4).toBe('4242')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2027)
    expect(result.holderName).toBe('Jane Doe')
    expect(result.customerId).toBe('SHOPPER-1')
    expect(result.gateway).toBe('adyen')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a sepadirectdebit stored method to type "bank_account"', () => {
    const raw: RawAdyenStoredPaymentMethod = {
      id: 'PM-002',
      shopperReference: 'SHOPPER-2',
      type: 'sepadirectdebit',
      iban: 'DE89370400440532013000',
      ownerName: 'Hans Müller',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bank_account')
    expect(result.holderName).toBe('Hans Müller')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a paypal stored method to type "wallet"', () => {
    const raw: RawAdyenStoredPaymentMethod = {
      id: 'PM-003',
      type: 'paypal',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps an unknown type to "other"', () => {
    const raw: RawAdyenStoredPaymentMethod = {
      id: 'PM-004',
      type: 'customtype',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('other')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
