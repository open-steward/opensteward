import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawUnzerPaymentType,
} from '../../../../../../../src/verticals/payments/adapters/unzer/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('unzer transformPaymentMethod', () => {
  it('maps a credit card (s-crd prefix) correctly', () => {
    const raw: RawUnzerPaymentType = {
      id: 's-crd-abc123',
      number: '444433******1111',
      brand: 'VISA',
      expiryDate: '04/2026',
      cardHolder: 'Jane Doe',
      recurring: false,
      createDate: '2024-01-15 10:00:00',
      cardDetails: {
        type: 'CREDIT',
        issuerName: 'Test Bank',
        countryIsoA2: 'DE',
      },
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('card')
    expect(result.brand).toBe('visa')
    expect(result.last4).toBe('1111')
    expect(result.expMonth).toBe(4)
    expect(result.expYear).toBe(2026)
    expect(result.holderName).toBe('Jane Doe')
    expect(result.id).toBe('s-crd-abc123')
    expect(result.externalId).toBe('s-crd-abc123')
    expect(result.gateway).toBe('unzer')
    expect(result.metadata.issuerName).toBe('Test Bank')
    expect(result.metadata.countryIsoA2).toBe('DE')
    expect(result.metadata.accountType).toBe('CREDIT')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a debit card (s-dcrd prefix) to type "card"', () => {
    const raw: RawUnzerPaymentType = {
      id: 's-dcrd-xyz789',
      number: '555500******4444',
      brand: 'Mastercard',
      expiryDate: '12/2027',
      cardHolder: 'John Smith',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('card')
    expect(result.brand).toBe('mastercard')
    expect(result.last4).toBe('4444')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2027)
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a SEPA direct debit (s-sdd prefix) to type "bank_account"', () => {
    const raw: RawUnzerPaymentType = {
      id: 's-sdd-sepa001',
      number: 'DE89370400440532013000',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bank_account')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a iDEAL direct debit (s-idd prefix) to type "bank_account"', () => {
    const raw: RawUnzerPaymentType = {
      id: 's-idd-ideal001',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bank_account')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps Apple Pay (s-aps prefix) to type "wallet"', () => {
    const raw: RawUnzerPaymentType = {
      id: 's-aps-applepay001',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps Google Pay (s-gop prefix) to type "wallet"', () => {
    const raw: RawUnzerPaymentType = {
      id: 's-gop-googlepay001',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps unknown prefix with brand to type "card"', () => {
    const raw: RawUnzerPaymentType = {
      id: 's-xyz-unknown001',
      brand: 'Amex',
      number: '371449635398431',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('card')
    expect(result.brand).toBe('amex')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps unknown prefix with no brand to type "other"', () => {
    const raw: RawUnzerPaymentType = {
      id: 's-ppy-paypal001',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('other')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('correctly extracts last4 from masked PAN', () => {
    const raw: RawUnzerPaymentType = {
      id: 's-crd-pan001',
      number: '400000******9999',
    }
    const result = transformPaymentMethod(raw)
    expect(result.last4).toBe('9999')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('handles missing expiry gracefully', () => {
    const raw: RawUnzerPaymentType = {
      id: 's-crd-noexp001',
      brand: 'Visa',
    }
    const result = transformPaymentMethod(raw)
    expect(result.expMonth).toBeUndefined()
    expect(result.expYear).toBeUndefined()
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('includes createDate as createdAt', () => {
    const raw: RawUnzerPaymentType = {
      id: 's-crd-date001',
      brand: 'Visa',
      createDate: '2024-06-01 12:00:00',
    }
    const result = transformPaymentMethod(raw)
    expect(result.createdAt).toBeDefined()
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
