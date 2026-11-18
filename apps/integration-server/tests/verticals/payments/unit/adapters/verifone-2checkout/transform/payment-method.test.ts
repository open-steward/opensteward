import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawVerifone2checkoutExistingCard,
} from '../../../../../../../src/verticals/payments/adapters/verifone-2checkout/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('verifone-2checkout transformPaymentMethod', () => {
  it('maps full card data with Token as id', () => {
    const raw: RawVerifone2checkoutExistingCard = {
      Token: 'tok_abc123',
      CardType: 'VISA',
      LastDigits: '4242',
      ExpirationMonth: '12',
      ExpirationYear: '2028',
      NameOnCard: 'Jane Doe',
    }
    const result = transformPaymentMethod(raw, 'CUST-001')
    expect(result.id).toBe('tok_abc123')
    expect(result.externalId).toBe('tok_abc123')
    expect(result.type).toBe('card')
    expect(result.brand).toBe('visa')
    expect(result.last4).toBe('4242')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2028)
    expect(result.holderName).toBe('Jane Doe')
    expect(result.customerId).toBe('CUST-001')
    expect(result.gateway).toBe('verifone-2checkout')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('builds composite id when Token is absent', () => {
    const raw: RawVerifone2checkoutExistingCard = {
      CardType: 'MASTERCARD',
      LastDigits: '5555',
      ExpirationMonth: '6',
      ExpirationYear: '2026',
      NameOnCard: 'John Smith',
    }
    const result = transformPaymentMethod(raw, 'CUST-002')
    expect(result.id).toBe('CUST-002_mastercard_5555')
    expect(result.brand).toBe('mastercard')
    expect(result.last4).toBe('5555')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('lowercases CardType for brand', () => {
    const raw: RawVerifone2checkoutExistingCard = {
      Token: 'tok_xyz789',
      CardType: 'AMERICAN EXPRESS',
      LastDigits: '0005',
      ExpirationMonth: 3,
      ExpirationYear: 2027,
    }
    const result = transformPaymentMethod(raw, 'CUST-003')
    expect(result.brand).toBe('american express')
    expect(result.expMonth).toBe(3)
    expect(result.expYear).toBe(2027)
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('handles numeric ExpirationMonth and ExpirationYear', () => {
    const raw: RawVerifone2checkoutExistingCard = {
      Token: 'tok_num',
      CardType: 'VISA',
      LastDigits: '1234',
      ExpirationMonth: 9,
      ExpirationYear: 2030,
    }
    const result = transformPaymentMethod(raw, 'CUST-004')
    expect(result.expMonth).toBe(9)
    expect(result.expYear).toBe(2030)
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('sets expMonth and expYear to undefined when absent', () => {
    const raw: RawVerifone2checkoutExistingCard = {
      Token: 'tok_noexp',
      CardType: 'VISA',
      LastDigits: '9876',
    }
    const result = transformPaymentMethod(raw, 'CUST-005')
    expect(result.expMonth).toBeUndefined()
    expect(result.expYear).toBeUndefined()
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('sets expMonth and expYear to undefined when null', () => {
    const raw: RawVerifone2checkoutExistingCard = {
      Token: 'tok_nullexp',
      CardType: 'VISA',
      LastDigits: '1111',
      ExpirationMonth: null,
      ExpirationYear: null,
    }
    const result = transformPaymentMethod(raw, 'CUST-006')
    expect(result.expMonth).toBeUndefined()
    expect(result.expYear).toBeUndefined()
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('sets holderName to undefined when NameOnCard is absent', () => {
    const raw: RawVerifone2checkoutExistingCard = {
      Token: 'tok_noname',
      CardType: 'DISCOVER',
      LastDigits: '6011',
      ExpirationMonth: '1',
      ExpirationYear: '2025',
    }
    const result = transformPaymentMethod(raw, 'CUST-007')
    expect(result.holderName).toBeUndefined()
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('type is always "card"', () => {
    const raw: RawVerifone2checkoutExistingCard = {
      Token: 'tok_type',
      CardType: 'VISA',
    }
    const result = transformPaymentMethod(raw, 'CUST-008')
    expect(result.type).toBe('card')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('stores CardType in metadata', () => {
    const raw: RawVerifone2checkoutExistingCard = {
      Token: 'tok_meta',
      CardType: 'MAESTRO',
      LastDigits: '6304',
      ExpirationMonth: '7',
      ExpirationYear: '2029',
    }
    const result = transformPaymentMethod(raw, 'CUST-009')
    expect(result.metadata.cardType).toBe('MAESTRO')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('handles empty customerId gracefully', () => {
    const raw: RawVerifone2checkoutExistingCard = {
      CardType: 'VISA',
      LastDigits: '4444',
      ExpirationMonth: '8',
      ExpirationYear: '2026',
    }
    const result = transformPaymentMethod(raw, '')
    // With no token and empty customerId, id is built from brand + last4
    expect(result.id).toBe('visa_4444')
    expect(result.customerId).toBeUndefined()
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('handles minimal input with only Token', () => {
    const raw: RawVerifone2checkoutExistingCard = {
      Token: 'tok_minimal',
    }
    const result = transformPaymentMethod(raw, 'CUST-010')
    expect(result.id).toBe('tok_minimal')
    expect(result.brand).toBeUndefined()
    expect(result.last4).toBeUndefined()
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
