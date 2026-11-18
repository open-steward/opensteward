import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawHyperswitchSavedPaymentMethod,
} from '../../../../../../../src/verticals/payments/adapters/hyperswitch/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('hyperswitch transformPaymentMethod', () => {
  it('maps a card payment method correctly', () => {
    const raw: RawHyperswitchSavedPaymentMethod = {
      payment_method_id: 'pm_001',
      payment_token: 'tok_001',
      customer_id: 'cus_001',
      payment_method: 'card',
      payment_method_type: 'credit',
      default_payment_method_set: true,
      card: {
        scheme: 'visa',
        last4_digits: '4242',
        expiry_month: '12',
        expiry_year: '2028',
        card_holder_name: 'Jane Doe',
      },
      created: '2024-03-01T00:00:00Z',
      last_used_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('pm_001')
    expect(result.type).toBe('card')
    expect(result.brand).toBe('visa')
    expect(result.last4).toBe('4242')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2028)
    expect(result.holderName).toBe('Jane Doe')
    expect(result.customerId).toBe('cus_001')
    expect(result.isDefault).toBe(true)
    expect(result.gateway).toBe('hyperswitch')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps bank_transfer payment method to type "bank_account"', () => {
    const raw: RawHyperswitchSavedPaymentMethod = {
      payment_method_id: 'pm_002',
      payment_token: 'tok_002',
      payment_method: 'bank_transfer',
      payment_method_issuer: 'Chase Bank',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bank_account')
    expect(result.bankName).toBe('Chase Bank')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps wallet payment method to type "wallet"', () => {
    const raw: RawHyperswitchSavedPaymentMethod = {
      payment_token: 'tok_003',
      payment_method: 'wallet',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
    // Falls back to payment_token for id
    expect(result.id).toBe('tok_003')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
