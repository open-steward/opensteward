import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawWorldpayToken,
} from '../../../../../../../src/verticals/payments/adapters/worldpay-fis/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('worldpay-fis transformPaymentMethod', () => {
  it('maps a credit card token to canonical type "card"', () => {
    const raw: RawWorldpayToken = {
      tokenId: 'tok_001',
      namespace: 'ns_abc',
      description: 'Primary card',
      tokenExpiryDateTime: '2028-12-31T23:59:59.000Z',
      paymentInstrument: {
        type: 'card/plain',
        cardNumber: '4111111111111111',
        cardHolderName: 'Jane Doe',
        cardExpiryDate: { month: 12, year: 2028 },
        bin: '411111',
        brand: 'visa',
        fundingType: 'credit',
        countryCode: 'US',
        last4Digits: '1111',
        networkType: 'VISA',
      },
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('tok_001')
    expect(result.externalId).toBe('tok_001')
    expect(result.type).toBe('card')
    expect(result.brand).toBe('visa')
    expect(result.last4).toBe('1111')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2028)
    expect(result.holderName).toBe('Jane Doe')
    expect(result.fingerprint).toBe('ns_abc')
    expect(result.gateway).toBe('worldpay-fis')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps an Apple Pay token to canonical type "wallet"', () => {
    const raw: RawWorldpayToken = {
      tokenId: 'tok_002',
      paymentInstrument: {
        brand: 'APPLEPAY',
        fundingType: 'debit',
        last4Digits: '4242',
      },
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
    expect(result.brand).toBe('applepay')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a Google Pay token to canonical type "wallet"', () => {
    const raw: RawWorldpayToken = {
      tokenId: 'tok_003',
      paymentInstrument: {
        brand: 'GOOGLEPAY',
      },
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a debit card token correctly', () => {
    const raw: RawWorldpayToken = {
      tokenId: 'tok_004',
      paymentInstrument: {
        brand: 'mastercard',
        fundingType: 'debit',
        last4Digits: '5678',
        cardExpiryDate: { month: 6, year: 2027 },
      },
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('card')
    expect(result.last4).toBe('5678')
    expect(result.expYear).toBe(2027)
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('defaults type to "other" when no brand or fundingType', () => {
    const raw: RawWorldpayToken = {
      tokenId: 'tok_005',
      paymentInstrument: {},
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('other')
    expect(result.id).toBe('tok_005')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('sets metadata fields from paymentInstrument', () => {
    const raw: RawWorldpayToken = {
      tokenId: 'tok_006',
      namespace: 'ns_xyz',
      description: 'Test token',
      paymentInstrument: {
        brand: 'visa',
        fundingType: 'credit',
        bin: '424242',
        networkType: 'VISA',
      },
    }
    const result = transformPaymentMethod(raw)
    expect(result.metadata['bin']).toBe('424242')
    expect(result.metadata['networkType']).toBe('VISA')
    expect(result.metadata['namespace']).toBe('ns_xyz')
    expect(result.metadata['description']).toBe('Test token')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
