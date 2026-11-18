import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawAuthNetPaymentProfile,
} from '../../../../../../../src/verticals/payments/adapters/authorize-net/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('authorize-net transformPaymentMethod (credit card)', () => {
  const base: RawAuthNetPaymentProfile = {
    customerPaymentProfileId: 'payprof-555',
    customerProfileId: 'profile-111',
    defaultPaymentProfile: true,
    billTo: { firstName: 'John', lastName: 'Doe' },
    payment: {
      creditCard: {
        cardNumber: 'XXXX1234',
        cardType: 'Visa',
        expirationDate: '2026-09',
      },
    },
  }

  it('maps customerPaymentProfileId to id and externalId', () => {
    const result = transformPaymentMethod(base)
    expect(result.id).toBe('payprof-555')
    expect(result.externalId).toBe('payprof-555')
  })

  it('maps customerProfileId to customerId', () => {
    const result = transformPaymentMethod(base)
    expect(result.customerId).toBe('profile-111')
  })

  it('maps credit card type to card', () => {
    const result = transformPaymentMethod(base)
    expect(result.type).toBe('card')
  })

  it('extracts last4 from cardNumber', () => {
    const result = transformPaymentMethod(base)
    expect(result.last4).toBe('1234')
  })

  it('parses expirationDate YYYY-MM into expYear and expMonth', () => {
    const result = transformPaymentMethod(base)
    expect(result.expYear).toBe(2026)
    expect(result.expMonth).toBe(9)
  })

  it('maps cardType to brand', () => {
    const result = transformPaymentMethod(base)
    expect(result.brand).toBe('Visa')
  })

  it('maps billTo name to holderName', () => {
    const result = transformPaymentMethod(base)
    expect(result.holderName).toBe('John Doe')
  })

  it('maps defaultPaymentProfile to isDefault', () => {
    const result = transformPaymentMethod(base)
    expect(result.isDefault).toBe(true)
  })

  it('puts customerPaymentProfileId in metadata', () => {
    const result = transformPaymentMethod(base)
    expect(result.metadata['customerPaymentProfileId']).toBe('payprof-555')
  })

  it('sets gateway to authorize-net', () => {
    const result = transformPaymentMethod(base)
    expect(result.gateway).toBe('authorize-net')
  })

  it('conforms to PaymentMethodSchema', () => {
    expect(() => PaymentMethodSchema.parse(transformPaymentMethod(base))).not.toThrow()
  })
})

describe('authorize-net transformPaymentMethod (bank account)', () => {
  const bankBase: RawAuthNetPaymentProfile = {
    customerPaymentProfileId: 'payprof-bank-1',
    customerProfileId: 'profile-222',
    defaultPaymentProfile: false,
    billTo: { firstName: 'Jane', lastName: 'Smith' },
    payment: {
      bankAccount: {
        bankName: 'First National',
        routingNumber: 'XXXX0001',
        accountNumber: 'XXXXXX6789',
        accountType: 'checking',
      },
    },
  }

  it('maps bank account type', () => {
    const result = transformPaymentMethod(bankBase)
    expect(result.type).toBe('bank_account')
  })

  it('extracts last4 from accountNumber', () => {
    const result = transformPaymentMethod(bankBase)
    expect(result.last4).toBe('6789')
  })

  it('maps bankName', () => {
    const result = transformPaymentMethod(bankBase)
    expect(result.bankName).toBe('First National')
  })

  it('conforms to PaymentMethodSchema', () => {
    expect(() => PaymentMethodSchema.parse(transformPaymentMethod(bankBase))).not.toThrow()
  })
})
