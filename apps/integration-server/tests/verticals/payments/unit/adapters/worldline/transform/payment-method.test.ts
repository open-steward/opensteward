import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawWorldlineToken,
} from '../../../../../../../src/verticals/payments/adapters/worldline/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('worldline transformPaymentMethod', () => {
  it('maps a card token with MMYY expiry to expMonth and expYear', () => {
    const raw: RawWorldlineToken = {
      id: 'wl-token-001',
      paymentProductId: 1,
      card: {
        alias: 'My Visa',
        data: {
          cardNumber: '411111111111**** 1234',
          cardholderName: 'Jane Doe',
          expiryDate: '1228',
        },
      },
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('wl-token-001')
    expect(result.type).toBe('card')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2028)
    expect(result.last4).toBe('1234')
    expect(result.holderName).toBe('Jane Doe')
    expect(result.gateway).toBe('worldline')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps an eWallet token to type "wallet"', () => {
    const raw: RawWorldlineToken = {
      id: 'wl-token-002',
      eWallet: {
        alias: 'PayPal Wallet',
        billingAgreementId: 'B-001',
      },
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
    expect(result.gateway).toBe('worldline')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a sepaDirectDebit token to type "bank_account"', () => {
    const raw: RawWorldlineToken = {
      id: 'wl-token-003',
      sepaDirectDebit: {
        alias: 'SEPA Mandate',
        mandate: {
          bankAccountIban: { iban: 'DE89370400440532013000', accountHolderName: 'Hans Schmidt' },
        },
      },
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bank_account')
    expect(result.gateway).toBe('worldline')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a token with no known sub-object to type "other"', () => {
    const raw: RawWorldlineToken = {
      id: 'wl-token-004',
      status: 'ACTIVE',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('other')
    expect(result.gateway).toBe('worldline')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('brand is always undefined (not available from token API)', () => {
    const raw: RawWorldlineToken = {
      id: 'wl-token-005',
      card: {
        data: { cardNumber: '4111111111114242', expiryDate: '0630' },
      },
    }
    const result = transformPaymentMethod(raw)
    expect(result.brand).toBeUndefined()
    expect(result.last4).toBe('4242')
    expect(result.expMonth).toBe(6)
    expect(result.expYear).toBe(2030)
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
