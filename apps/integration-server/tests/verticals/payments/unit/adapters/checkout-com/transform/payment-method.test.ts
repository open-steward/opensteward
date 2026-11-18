import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawCheckoutInstrument,
} from '../../../../../../../src/verticals/payments/adapters/checkout-com/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('checkout-com transformPaymentMethod', () => {
  it('maps a card instrument to type "card"', () => {
    const raw: RawCheckoutInstrument = {
      id: 'src_001',
      type: 'card',
      customer: { id: 'cus_001' },
      last4: '4242',
      expiry_month: 12,
      expiry_year: 2027,
      scheme: 'VISA',
      fingerprint: 'fp_abc123',
      account_holder: { first_name: 'Alice', last_name: 'Smith' },
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('src_001')
    expect(result.type).toBe('card')
    expect(result.customerId).toBe('cus_001')
    expect(result.last4).toBe('4242')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2027)
    expect(result.brand).toBe('visa')
    expect(result.holderName).toBe('Alice Smith')
    expect(result.fingerprint).toBe('fp_abc123')
    expect(result.gateway).toBe('checkout-com')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a sepa instrument to type "bank_account"', () => {
    const raw: RawCheckoutInstrument = {
      id: 'src_002',
      type: 'sepa',
      customer: { id: 'cus_002' },
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bank_account')
    expect(result.customerId).toBe('cus_002')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a klarna instrument to type "bnpl"', () => {
    const raw: RawCheckoutInstrument = {
      id: 'src_003',
      type: 'klarna',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bnpl')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a googlepay instrument to type "wallet"', () => {
    const raw: RawCheckoutInstrument = {
      id: 'src_004',
      type: 'googlepay',
      customer: { id: 'cus_004' },
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps unknown instrument type to "other"', () => {
    const raw: RawCheckoutInstrument = {
      id: 'src_005',
      type: 'unknown_instrument',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('other')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('lowercases the scheme for brand', () => {
    const raw: RawCheckoutInstrument = {
      id: 'src_006',
      type: 'card',
      scheme: 'MASTERCARD',
    }
    const result = transformPaymentMethod(raw)
    expect(result.brand).toBe('mastercard')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
