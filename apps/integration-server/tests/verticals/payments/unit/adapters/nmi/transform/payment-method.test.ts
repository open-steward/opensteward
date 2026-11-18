import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawNmiVaultPaymentMethod,
} from '../../../../../../../src/verticals/payments/adapters/nmi/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('nmi transformPaymentMethod', () => {
  it('maps a credit card vault record', () => {
    const raw: RawNmiVaultPaymentMethod = {
      customerVaultId: 'vault-001',
      ccNumber: '4xxxxxxxxxxx4242',
      ccType: 'visa',
      ccExp: '1228',
      ccBin: '424242',
      firstName: 'Jane',
      lastName: 'Doe',
      created: '20240301000000',
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('vault-001')
    expect(result.externalId).toBe('vault-001')
    expect(result.type).toBe('card')
    expect(result.brand).toBe('visa')
    expect(result.last4).toBe('4242')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2028)
    expect(result.holderName).toBe('Jane Doe')
    expect(result.fingerprint).toBe('424242')
    expect(result.gateway).toBe('nmi')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps an ACH bank account vault record', () => {
    const raw: RawNmiVaultPaymentMethod = {
      customerVaultId: 'vault-002',
      checkAccount: 'xxxxx6789',
      checkAba: '021000021',
      checkName: 'Business Checking',
      accountHolderType: 'business',
      accountType: 'checking',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bank_account')
    expect(result.last4).toBe('6789')
    expect(result.holderName).toBe('Business Checking')
    expect(result.metadata['check_aba']).toBe('021000021')
    expect(result.metadata['account_holder_type']).toBe('business')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps an unknown payment type to "other"', () => {
    const raw: RawNmiVaultPaymentMethod = {
      customerVaultId: 'vault-003',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('other')
    expect(result.brand).toBeUndefined()
    expect(result.last4).toBeUndefined()
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('parses ccExp "0126" as month=1, year=2026', () => {
    const raw: RawNmiVaultPaymentMethod = {
      customerVaultId: 'vault-004',
      ccNumber: '5xxxxxxxxxxx5454',
      ccType: 'mastercard',
      ccExp: '0126',
    }
    const result = transformPaymentMethod(raw)
    expect(result.expMonth).toBe(1)
    expect(result.expYear).toBe(2026)
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
