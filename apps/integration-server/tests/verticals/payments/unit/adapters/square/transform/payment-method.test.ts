import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawSquareCard,
} from '../../../../../../../src/verticals/payments/adapters/square/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('square transformPaymentMethod', () => {
  it('maps a Square card token to canonical PaymentMethod', () => {
    const raw: RawSquareCard = {
      id: 'CARD-001',
      customer_id: 'CUST-001',
      card_brand: 'MASTERCARD',
      last_4: '5678',
      exp_month: 12,
      exp_year: 2026,
      cardholder_name: 'Bob Jones',
      fingerprint: 'fp_abc123',
      enabled: true,
      card_type: 'CREDIT',
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('CARD-001')
    expect(result.type).toBe('card')
    expect(result.brand).toBe('mastercard')
    expect(result.last4).toBe('5678')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2026)
    expect(result.holderName).toBe('Bob Jones')
    expect(result.customerId).toBe('CUST-001')
    expect(result.fingerprint).toBe('fp_abc123')
    expect(result.gateway).toBe('square')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('handles a minimal card with only required fields', () => {
    const raw: RawSquareCard = {
      id: 'CARD-002',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('card')
    expect(result.brand).toBeUndefined()
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
