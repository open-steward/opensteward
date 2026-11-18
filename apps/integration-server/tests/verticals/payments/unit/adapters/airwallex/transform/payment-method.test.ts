import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawAirwallexPaymentMethod,
} from '../../../../../../../src/verticals/payments/adapters/airwallex/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('airwallex transformPaymentMethod', () => {
  it('maps type "card" with card details correctly', () => {
    const raw: RawAirwallexPaymentMethod = {
      id: 'pm-001',
      type: 'card',
      customer_id: 'cus-001',
      card: {
        last_four: '4242',
        expiry_month: '03',
        expiry_year: '2028',
        name: 'Jane Doe',
        brand: 'visa',
        fingerprint: 'fp-abc',
      },
      status: 'ACTIVE',
      created_at: '2024-03-01T12:00:00+0000',
      updated_at: '2024-03-01T12:00:00+0000',
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('pm-001')
    expect(result.type).toBe('card')
    expect(result.last4).toBe('4242')
    expect(result.expMonth).toBe(3)
    expect(result.expYear).toBe(2028)
    expect(result.holderName).toBe('Jane Doe')
    expect(result.brand).toBe('visa')
    expect(result.fingerprint).toBe('fp-abc')
    expect(result.customerId).toBe('cus-001')
    expect(result.gateway).toBe('airwallex')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps type "wechatpay" to "wallet"', () => {
    const raw: RawAirwallexPaymentMethod = {
      id: 'pm-002',
      type: 'wechatpay',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps type "alipaycn" to "wallet"', () => {
    const raw: RawAirwallexPaymentMethod = {
      id: 'pm-003',
      type: 'alipaycn',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps type "googlepay" to "wallet"', () => {
    const raw: RawAirwallexPaymentMethod = {
      id: 'pm-004',
      type: 'googlepay',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps type "directdebit" to "bank_account"', () => {
    const raw: RawAirwallexPaymentMethod = {
      id: 'pm-005',
      type: 'directdebit',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bank_account')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps unknown type to "other"', () => {
    const raw: RawAirwallexPaymentMethod = {
      id: 'pm-006',
      type: 'unknown_method',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('other')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('builds holderName from billing first/last when card.name is absent', () => {
    const raw: RawAirwallexPaymentMethod = {
      id: 'pm-007',
      type: 'card',
      card: { last_four: '1234', brand: 'mastercard' },
      billing: { first_name: 'Alice', last_name: 'Smith' },
    }
    const result = transformPaymentMethod(raw)
    expect(result.holderName).toBe('Alice Smith')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
