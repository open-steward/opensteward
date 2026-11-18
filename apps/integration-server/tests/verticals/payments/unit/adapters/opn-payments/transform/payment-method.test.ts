import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawOpnCard,
} from '../../../../../../../src/verticals/payments/adapters/opn-payments/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('opn-payments transformPaymentMethod', () => {
  it('maps card fields to canonical payment method', () => {
    const raw: RawOpnCard = {
      id: 'card_test_abc',
      object: 'card',
      brand: 'Visa',
      last_digits: '4242',
      expiration_month: 12,
      expiration_year: 2028,
      name: 'Jane Doe',
      fingerprint: 'fp_xyz',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw, 'cust_test_123')
    expect(result.id).toBe('card_test_abc')
    expect(result.externalId).toBe('card_test_abc')
    expect(result.customerId).toBe('cust_test_123')
    expect(result.type).toBe('card')
    expect(result.brand).toBe('Visa')
    expect(result.last4).toBe('4242')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2028)
    expect(result.holderName).toBe('Jane Doe')
    expect(result.fingerprint).toBe('fp_xyz')
    expect(result.gateway).toBe('opn-payments')
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('falls back to raw["customer"] when customerId arg is not provided', () => {
    const raw: RawOpnCard = {
      id: 'card_test_def',
      object: 'card',
      customer: 'cust_from_raw',
    }
    const result = transformPaymentMethod(raw)
    expect(result.customerId).toBe('cust_from_raw')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps truemoney object to wallet type', () => {
    const raw: RawOpnCard = {
      id: 'src_wallet_01',
      object: 'truemoney',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps bank_account object to bank_account type', () => {
    const raw: RawOpnCard = {
      id: 'src_bank_01',
      object: 'bank_account',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bank_account')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps installment object to bnpl type', () => {
    const raw: RawOpnCard = {
      id: 'src_bnpl_01',
      object: 'installment',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bnpl')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('defaults to other for unknown object type', () => {
    const raw: RawOpnCard = {
      id: 'src_unk_01',
      object: 'unknown_source',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('other')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('stores currency in metadata upcased', () => {
    const raw: RawOpnCard = {
      id: 'card_meta_01',
      object: 'card',
      currency: 'thb',
      bank: 'KBANK',
      country: 'TH',
    }
    const result = transformPaymentMethod(raw)
    expect(result.metadata['currency']).toBe('THB')
    expect(result.metadata['bank']).toBe('KBANK')
    expect(result.metadata['country']).toBe('TH')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
