import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawNuveiUPO,
} from '../../../../../../../src/verticals/payments/adapters/nuvei/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('nuvei transformPaymentMethod', () => {
  it('maps a cc_card UPO to canonical PaymentMethod with type card', () => {
    const raw: RawNuveiUPO = {
      userPaymentOptionId: 'upo_001',
      paymentMethodName: 'cc_card',
      upoStatus: 'ENABLED',
      upoData: {
        last4Digits: '4242',
        ccExpMonth: '12',
        ccExpYear: '2028',
        ccNameOnCard: 'Jane Doe',
        brand: 'visa',
      },
    }
    const result = transformPaymentMethod(raw, 'user_tok_abc')
    expect(result.id).toBe('upo_001')
    expect(result.externalId).toBe('upo_001')
    expect(result.type).toBe('card')
    expect(result.last4).toBe('4242')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2028)
    expect(result.holderName).toBe('Jane Doe')
    expect(result.brand).toBe('visa')
    expect(result.customerId).toBe('user_tok_abc')
    expect(result.gateway).toBe('nuvei')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps PayPal APM to type wallet', () => {
    const raw: RawNuveiUPO = {
      userPaymentOptionId: 'upo_paypal',
      paymentMethodName: 'apmgw_PayPal',
      upoName: 'PayPal Account',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps bank/ACH payment method to type bank_account', () => {
    const raw: RawNuveiUPO = {
      userPaymentOptionId: 'upo_bank',
      paymentMethodName: 'ach_bank',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bank_account')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps unknown payment method name to type other', () => {
    const raw: RawNuveiUPO = {
      userPaymentOptionId: 'upo_other',
      paymentMethodName: 'crypto_btc',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('other')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('parses expiry from expiryDate string "MMYYYY" when upoData fields are absent', () => {
    const raw: RawNuveiUPO = {
      userPaymentOptionId: 'upo_expiry',
      paymentMethodName: 'cc_card',
      expiryDate: '032026',
      upoData: {
        last4Digits: '1111',
      },
    }
    const result = transformPaymentMethod(raw)
    expect(result.expMonth).toBe(3)
    expect(result.expYear).toBe(2026)
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('prefers upoData ccExpMonth/ccExpYear over expiryDate', () => {
    const raw: RawNuveiUPO = {
      userPaymentOptionId: 'upo_pref',
      paymentMethodName: 'cc_card',
      expiryDate: '012099',
      upoData: {
        last4Digits: '5555',
        ccExpMonth: '09',
        ccExpYear: '2030',
      },
    }
    const result = transformPaymentMethod(raw)
    expect(result.expMonth).toBe(9)
    expect(result.expYear).toBe(2030)
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('picks userTokenId from raw.userTokenId when caller does not pass it', () => {
    const raw: RawNuveiUPO = {
      userPaymentOptionId: 'upo_tok',
      paymentMethodName: 'cc_card',
      userTokenId: 'tok_from_raw',
    }
    const result = transformPaymentMethod(raw)
    expect(result.customerId).toBe('tok_from_raw')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('stores paymentMethodName, upoName, and upoStatus in metadata', () => {
    const raw: RawNuveiUPO = {
      userPaymentOptionId: 'upo_meta',
      paymentMethodName: 'cc_card',
      upoName: 'My Visa',
      upoStatus: 'SUSPENDED',
      issuerCountry: 'US',
      upoData: {
        bin: '424242',
      },
    }
    const result = transformPaymentMethod(raw)
    expect(result.metadata.paymentMethodName).toBe('cc_card')
    expect(result.metadata.upoName).toBe('My Visa')
    expect(result.metadata.upoStatus).toBe('SUSPENDED')
    expect(result.metadata.issuerCountry).toBe('US')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
