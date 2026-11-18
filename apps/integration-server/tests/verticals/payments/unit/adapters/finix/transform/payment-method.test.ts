import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawFinixPaymentInstrument,
} from '../../../../../../../src/verticals/payments/adapters/finix/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('finix transformPaymentMethod', () => {
  it('maps a PAYMENT_CARD instrument to type "card"', () => {
    const raw: RawFinixPaymentInstrument = {
      id: 'PIi1',
      instrument_type: 'PAYMENT_CARD',
      brand: 'VISA',
      last_four: '4242',
      expiration_month: 12,
      expiration_year: 2026,
      name: 'Jane Doe',
      fingerprint: 'fp-abc123',
      identity: 'IDi1',
      enabled: true,
      created_at: '2024-03-01T00:00:00.000Z',
      updated_at: '2024-03-01T00:00:00.000Z',
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('PIi1')
    expect(result.type).toBe('card')
    expect(result.brand).toBe('visa')
    expect(result.last4).toBe('4242')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2026)
    expect(result.holderName).toBe('Jane Doe')
    expect(result.customerId).toBe('IDi1')
    expect(result.fingerprint).toBe('fp-abc123')
    expect(result.gateway).toBe('finix')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a BANK_ACCOUNT instrument to type "bank_account"', () => {
    const raw: RawFinixPaymentInstrument = {
      id: 'PIi2',
      instrument_type: 'BANK_ACCOUNT',
      bank_code: 'CHASE',
      masked_account_number: '****1234',
      account_type: 'CHECKING',
      identity: 'IDi2',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bank_account')
    expect(result.bankName).toBe('CHASE')
    expect(result.metadata['account_type']).toBe('CHECKING')
    expect(result.metadata['masked_account_number']).toBe('****1234')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a TOKEN instrument to type "other"', () => {
    const raw: RawFinixPaymentInstrument = {
      id: 'PIi3',
      instrument_type: 'TOKEN',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('other')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('lowercases brand', () => {
    const raw: RawFinixPaymentInstrument = {
      id: 'PIi4',
      instrument_type: 'PAYMENT_CARD',
      brand: 'MASTERCARD',
    }
    const result = transformPaymentMethod(raw)
    expect(result.brand).toBe('mastercard')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
