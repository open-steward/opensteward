import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawIxopayRegister,
} from '../../../../../../../src/verticals/payments/adapters/ixopay/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('ixopay transformPaymentMethod', () => {
  it('detects card type from lastFourDigits in returnData', () => {
    const raw: RawIxopayRegister = {
      uuid: 'reg-uuid-001',
      paymentMethod: 'CREDITCARD',
      returnData: {
        cardHolder: 'John Doe',
        type: 'VISA',
        expiryMonth: 3,
        expiryYear: 2026,
        lastFourDigits: '4242',
        binBrand: 'VISA',
        fingerprint: 'fp-001',
      },
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('card')
    expect(result.last4).toBe('4242')
    expect(result.brand).toBe('VISA')
    expect(result.expMonth).toBe(3)
    expect(result.expYear).toBe(2026)
    expect(result.holderName).toBe('John Doe')
    expect(result.gateway).toBe('ixopay')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('detects bank_account type from iban in returnData', () => {
    const raw: RawIxopayRegister = {
      uuid: 'reg-uuid-002',
      paymentMethod: 'SEPA',
      returnData: {
        accountOwner: 'Jane Doe',
        iban: 'DE89370400440532013000',
        bic: 'COBADEFFXXX',
        bankName: 'Commerzbank',
      },
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bank_account')
    expect(result.holderName).toBe('Jane Doe')
    expect(result.bankName).toBe('Commerzbank')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('detects wallet type from walletType in returnData', () => {
    const raw: RawIxopayRegister = {
      uuid: 'reg-uuid-003',
      paymentMethod: 'WALLET',
      returnData: {
        walletType: 'PAYPAL',
        walletReferenceId: 'wal-ref-001',
        walletOwner: 'user@paypal.com',
      },
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
    expect(result.brand).toBe('PAYPAL')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
