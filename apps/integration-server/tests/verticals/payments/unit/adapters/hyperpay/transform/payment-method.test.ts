import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawHyperpayRegistration,
} from '../../../../../../../src/verticals/payments/adapters/hyperpay/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('hyperpay transformPaymentMethod', () => {
  it('maps a VISA registration to type "card" with normalised brand', () => {
    const raw: RawHyperpayRegistration = {
      id: 'reg-001',
      paymentBrand: 'VISA',
      card: {
        bin: '411111',
        last4Digits: '1111',
        holder: 'Jane Doe',
        expiryMonth: '12',
        expiryYear: '2028',
      },
      result: { code: '000.000.000', description: 'Transaction succeeded' },
      timestamp: '2024-03-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('card')
    expect(result.brand).toBe('visa')
    expect(result.last4).toBe('1111')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2028)
    expect(result.holderName).toBe('Jane Doe')
    expect(result.gateway).toBe('hyperpay')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('normalises MASTER brand to "mastercard"', () => {
    const raw: RawHyperpayRegistration = {
      id: 'reg-002',
      paymentBrand: 'MASTER',
      card: {
        last4Digits: '4444',
        expiryMonth: '06',
        expiryYear: '2027',
      },
      timestamp: '2024-03-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw)
    expect(result.brand).toBe('mastercard')
    expect(result.last4).toBe('4444')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('handles missing card and returns type "card" with undefined brand', () => {
    const raw: RawHyperpayRegistration = {
      id: 'reg-003',
      paymentBrand: 'AMEX',
      timestamp: '2024-03-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('card')
    expect(result.brand).toBe('amex')
    expect(result.last4).toBeUndefined()
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
