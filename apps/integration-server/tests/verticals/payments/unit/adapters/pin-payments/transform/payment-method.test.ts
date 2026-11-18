import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawPinCard,
} from '../../../../../../../src/verticals/payments/adapters/pin-payments/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('pin-payments transformPaymentMethod', () => {
  it('maps a visa card with display_number to type "card" and extracts last4', () => {
    const raw: RawPinCard = {
      token: 'pm_visa',
      customer_token: 'cus_abc',
      scheme: 'visa',
      display_number: 'XXXX-XXXX-XXXX-4242',
      expiry_month: 12,
      expiry_year: 2026,
      name: 'Alice Smith',
      primary: true,
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('card')
    expect(result.id).toBe('pm_visa')
    expect(result.customerId).toBe('cus_abc')
    expect(result.last4).toBe('4242')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2026)
    expect(result.holderName).toBe('Alice Smith')
    expect(result.isDefault).toBe(true)
    expect(result.gateway).toBe('pin-payments')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps scheme "bank_account" to type "bank_account"', () => {
    const raw: RawPinCard = {
      token: 'pm_bank',
      scheme: 'bank_account',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bank_account')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('defaults to type "card" for unknown scheme', () => {
    const raw: RawPinCard = {
      token: 'pm_other',
      scheme: 'unknown_network',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('card')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
