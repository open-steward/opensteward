import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawDodoPaymentMethod,
} from '../../../../../../../src/verticals/payments/adapters/dodo-payments/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('dodo-payments transformPaymentMethod', () => {
  it('maps a card payment method with full card details', () => {
    const raw: RawDodoPaymentMethod = {
      payment_method_id: 'pm_001',
      payment_method: 'card',
      payment_method_type: 'visa',
      card: {
        card_holder_name: 'Jane Doe',
        card_network: 'visa',
        card_type: 'credit',
        last4_digits: '4242',
        expiry_month: '12',
        expiry_year: '2028',
        card_issuing_country: 'US',
      },
      last_used_at: '2024-03-01T00:00:00Z',
      recurring_enabled: true,
      customer_id: 'cus_001',
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('pm_001')
    expect(result.externalId).toBe('pm_001')
    expect(result.type).toBe('card')
    expect(result.brand).toBe('visa')
    expect(result.last4).toBe('4242')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2028)
    expect(result.holderName).toBe('Jane Doe')
    expect(result.customerId).toBe('cus_001')
    expect(result.gateway).toBe('dodo-payments')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('prefers passed customerId over raw.customer_id', () => {
    const raw: RawDodoPaymentMethod = {
      payment_method_id: 'pm_002',
      payment_method: 'wallet',
      customer_id: 'cus_raw',
      last_used_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw, 'cus_override')
    expect(result.customerId).toBe('cus_override')
    expect(result.type).toBe('wallet')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps bank_transfer to "bank_account"', () => {
    const raw: RawDodoPaymentMethod = {
      payment_method_id: 'pm_003',
      payment_method: 'bank_transfer',
      last_used_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bank_account')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps unknown/crypto payment_method to "other"', () => {
    const raw: RawDodoPaymentMethod = {
      payment_method_id: 'pm_004',
      payment_method: 'crypto',
      last_used_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('other')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
