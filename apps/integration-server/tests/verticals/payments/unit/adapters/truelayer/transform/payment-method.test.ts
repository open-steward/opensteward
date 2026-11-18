import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawStripePaymentMethod,
} from '../../../../../../../src/verticals/payments/adapters/truelayer/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('truelayer transformPaymentMethod', () => {
  it('maps a card payment method', () => {
    const raw: RawStripePaymentMethod = {
      id: 'pm_tl_001',
      object: 'payment_method',
      type: 'card',
      customer: 'cus_tl_001',
      card: {
        brand: 'visa',
        last4: '4242',
        exp_month: 12,
        exp_year: 2026,
        fingerprint: 'fp_tl_001',
      },
      billing_details: { name: 'Alice Smith' },
      created: 1709251200,
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('pm_tl_001')
    expect(result.type).toBe('card')
    expect(result.brand).toBe('visa')
    expect(result.last4).toBe('4242')
    expect(result.customerId).toBe('cus_tl_001')
    expect(result.gateway).toBe('stripe')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a bank account (us_bank_account) payment method', () => {
    const raw: RawStripePaymentMethod = {
      id: 'pm_tl_002',
      object: 'payment_method',
      type: 'us_bank_account',
      us_bank_account: {
        bank_name: 'Chase',
        last4: '6789',
        fingerprint: 'fp_tl_002',
      },
      created: 1709337600,
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bank_account')
    expect(result.bankName).toBe('Chase')
    expect(result.last4).toBe('6789')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
