import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawDLocalCard,
} from '../../../../../../../src/verticals/payments/adapters/dlocal/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('dlocal transformPaymentMethod', () => {
  it('maps a card with all fields correctly', () => {
    const raw: RawDLocalCard = {
      card_id: 'card-001',
      holder_name: 'Jane Doe',
      expiration_month: 12,
      expiration_year: 2027,
      brand: 'VISA',
      last4: '4242',
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('card-001')
    expect(result.type).toBe('card')
    expect(result.brand).toBe('visa')
    expect(result.last4).toBe('4242')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2027)
    expect(result.holderName).toBe('Jane Doe')
    expect(result.gateway).toBe('dlocal')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a card with string expiration values', () => {
    const raw: RawDLocalCard = {
      card_id: 'card-002',
      brand: 'MASTERCARD',
      last4: '1234',
      expiration_month: '6',
      expiration_year: '2028',
    }
    const result = transformPaymentMethod(raw)
    expect(result.brand).toBe('mastercard')
    expect(result.expMonth).toBe(6)
    expect(result.expYear).toBe(2028)
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
