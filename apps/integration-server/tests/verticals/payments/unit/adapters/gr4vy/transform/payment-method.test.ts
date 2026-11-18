import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawGr4vyPaymentMethod,
} from '../../../../../../../src/verticals/payments/adapters/gr4vy/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('gr4vy transformPaymentMethod', () => {
  it('maps a card payment method with expiry and last4', () => {
    const raw: RawGr4vyPaymentMethod = {
      id: 'pm-001',
      method: 'card',
      scheme: 'visa',
      label: '4242',
      expiration_date: '12/26',
      fingerprint: 'fp-001',
      buyer: { id: 'buyer-001' },
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('pm-001')
    expect(result.type).toBe('card')
    expect(result.brand).toBe('visa')
    expect(result.last4).toBe('4242')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2026)
    expect(result.customerId).toBe('buyer-001')
    expect(result.fingerprint).toBe('fp-001')
    expect(result.gateway).toBe('gr4vy')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a googlepay method to type "wallet"', () => {
    const raw: RawGr4vyPaymentMethod = {
      id: 'pm-002',
      method: 'googlepay',
      currency: 'USD',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
    expect(result.brand).toBe('googlepay')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a klarna method to type "bnpl"', () => {
    const raw: RawGr4vyPaymentMethod = {
      id: 'pm-003',
      method: 'klarna',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bnpl')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a sepa bank method to type "bank_account"', () => {
    const raw: RawGr4vyPaymentMethod = {
      id: 'pm-004',
      method: 'sepa',
      details: { issuer_name: 'Deutsche Bank' },
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bank_account')
    expect(result.bankName).toBe('Deutsche Bank')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps an unknown method to type "other"', () => {
    const raw: RawGr4vyPaymentMethod = {
      id: 'pm-005',
      method: 'custom_gateway_x',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('other')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
