import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawStripePaymentMethod,
} from '../../../../../../../src/verticals/payments/adapters/triple-a/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('triple-a transformPaymentMethod', () => {
  it('maps a card payment method', () => {
    const raw: RawStripePaymentMethod = {
      id: 'pm-ta-001',
      object: 'payment_method',
      type: 'card',
      customer: 'cus-ta-001',
      card: {
        brand: 'mastercard',
        last4: '5555',
        exp_month: 6,
        exp_year: 2027,
        fingerprint: 'fp-ta-abc',
      },
      created: 1709251200,
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('pm-ta-001')
    expect(result.type).toBe('card')
    expect(result.last4).toBe('5555')
    expect(result.expMonth).toBe(6)
    expect(result.expYear).toBe(2027)
    expect(result.brand).toBe('mastercard')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a wallet payment method (apple_pay)', () => {
    const raw: RawStripePaymentMethod = {
      id: 'pm-ta-002',
      object: 'payment_method',
      type: 'apple_pay',
      created: 1709251200,
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
