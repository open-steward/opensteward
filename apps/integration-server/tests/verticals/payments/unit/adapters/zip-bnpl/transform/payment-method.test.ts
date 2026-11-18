import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawStripePaymentMethod,
} from '../../../../../../../src/verticals/payments/adapters/zip-bnpl/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('zip-bnpl transformPaymentMethod', () => {
  it('maps card type with brand and last4', () => {
    const raw: RawStripePaymentMethod = {
      id: 'zip-pm-001',
      object: 'payment_method',
      type: 'card',
      customer: 'cus-001',
      card: {
        brand: 'visa',
        last4: '4242',
        exp_month: 12,
        exp_year: 2026,
        fingerprint: 'fp-abc',
      },
      created: 1709251200,
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('zip-pm-001')
    expect(result.type).toBe('card')
    expect(result.brand).toBe('visa')
    expect(result.last4).toBe('4242')
    expect(result.customerId).toBe('cus-001')
    expect(result.gateway).toBe('stripe')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps bank_account type for us_bank_account', () => {
    const raw: RawStripePaymentMethod = {
      id: 'zip-pm-002',
      object: 'payment_method',
      type: 'us_bank_account',
      us_bank_account: { bank_name: 'Chase', last4: '6789', fingerprint: 'fp-bank' },
      created: 1709251200,
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bank_account')
    expect(result.last4).toBe('6789')
    expect(result.bankName).toBe('Chase')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps bnpl type for klarna', () => {
    const raw: RawStripePaymentMethod = {
      id: 'zip-pm-003',
      object: 'payment_method',
      type: 'klarna',
      created: 1709251200,
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bnpl')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
