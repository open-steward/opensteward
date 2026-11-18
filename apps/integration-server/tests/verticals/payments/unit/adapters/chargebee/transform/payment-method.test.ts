import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawChargebeePaymentSource,
} from '../../../../../../../src/verticals/payments/adapters/chargebee/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

const baseRaw: RawChargebeePaymentSource = {
  id: 'pm_001',
  customer_id: 'cust_123',
  type: 'card',
  status: 'VALID',
  card: {
    brand: 'visa',
    last4: '4242',
    expiry_month: 3,
    expiry_year: 2026,
    name_on_card: 'Alice Smith',
  },
  is_primary: true,
  created_at: 1709251200, // 2024-03-01T00:00:00Z
  updated_at: 1709251200,
}

describe('chargebee transformPaymentMethod', () => {
  it('resolves type "card" and surfaces card details', () => {
    const result = transformPaymentMethod(baseRaw)
    expect(result.type).toBe('card')
    expect(result.brand).toBe('visa')
    expect(result.last4).toBe('4242')
    expect(result.gateway).toBe('chargebee')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps expiry month/year and holderName from card', () => {
    const result = transformPaymentMethod(baseRaw)
    expect(result.expMonth).toBe(3)
    expect(result.expYear).toBe(2026)
    expect(result.holderName).toBe('Alice Smith')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('resolves type "paypal_express_checkout" to "wallet"', () => {
    const result = transformPaymentMethod({
      ...baseRaw,
      type: 'paypal_express_checkout',
      card: null,
    })
    expect(result.type).toBe('wallet')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('resolves type "sepa_debit" to "bank_account"', () => {
    const result = transformPaymentMethod({
      ...baseRaw,
      type: 'sepa_debit',
      card: null,
      bank_account: { name_on_account: 'Bob Jones', bank_name: 'Deutsche Bank', last4: '5678' },
    })
    expect(result.type).toBe('bank_account')
    expect(result.holderName).toBe('Bob Jones')
    expect(result.bankName).toBe('Deutsche Bank')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('resolves an unknown type to "other"', () => {
    const result = transformPaymentMethod({ ...baseRaw, type: 'unknown_type', card: null })
    expect(result.type).toBe('other')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('surfaces is_primary as isDefault', () => {
    const result = transformPaymentMethod(baseRaw)
    expect(result.isDefault).toBe(true)
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
