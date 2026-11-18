import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawStripePaymentMethod,
} from '../../../../../../../src/verticals/payments/adapters/tyro/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('tyro transformPaymentMethod', () => {
  it('maps a card payment method', () => {
    const raw: RawStripePaymentMethod = {
      id: 'pm_tyro_001',
      object: 'payment_method',
      type: 'card',
      customer: 'cus_tyro_001',
      card: {
        brand: 'mastercard',
        last4: '5555',
        exp_month: 8,
        exp_year: 2027,
        fingerprint: 'fp_tyro_001',
      },
      billing_details: { name: 'John Smith' },
      created: 1709251200,
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('pm_tyro_001')
    expect(result.type).toBe('card')
    expect(result.brand).toBe('mastercard')
    expect(result.last4).toBe('5555')
    expect(result.expMonth).toBe(8)
    expect(result.expYear).toBe(2027)
    expect(result.customerId).toBe('cus_tyro_001')
    expect(result.gateway).toBe('stripe')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps an eftpos (other) payment method', () => {
    const raw: RawStripePaymentMethod = {
      id: 'pm_tyro_002',
      object: 'payment_method',
      type: 'eftpos_au',
      created: 1709337600,
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('other')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
