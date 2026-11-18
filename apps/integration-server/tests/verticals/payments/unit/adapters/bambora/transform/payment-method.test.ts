import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawBamboraCard,
} from '../../../../../../../src/verticals/payments/adapters/bambora/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('bambora transformPaymentMethod', () => {
  it('maps a Visa card to canonical PaymentMethod', () => {
    const raw: RawBamboraCard = {
      card_id: 1,
      name: 'Jane Doe',
      number: 'XXXX XXXX XXXX 1234',
      expiry_month: '03',
      expiry_year: '28',
      card_type: 'VI',
      function: 'DEF',
    }
    const result = transformPaymentMethod(raw, 'prof-001')
    expect(result.brand).toBe('visa')
    expect(result.last4).toBe('1234')
    expect(result.expMonth).toBe(3)
    expect(result.expYear).toBe(2028)
    expect(result.isDefault).toBe(true)
    expect(result.customerId).toBe('prof-001')
    expect(result.type).toBe('card')
    expect(result.gateway).toBe('bambora')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a Mastercard (MC) brand correctly', () => {
    const raw: RawBamboraCard = {
      card_id: 2,
      name: 'John Smith',
      number: 'XXXX XXXX XXXX 5678',
      expiry_month: '12',
      expiry_year: '29',
      card_type: 'MC',
      function: 'SEC',
    }
    const result = transformPaymentMethod(raw, 'prof-002')
    expect(result.brand).toBe('mastercard')
    expect(result.last4).toBe('5678')
    expect(result.isDefault).toBe(false)
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps an Amex (AX) brand correctly', () => {
    const raw: RawBamboraCard = {
      card_id: 3,
      number: 'XXXX XXXX XXXX 0001',
      expiry_month: '06',
      expiry_year: '30',
      card_type: 'AX',
    }
    const result = transformPaymentMethod(raw)
    expect(result.brand).toBe('amex')
    expect(result.customerId).toBeUndefined()
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('handles missing card number gracefully', () => {
    const raw: RawBamboraCard = {
      card_id: 4,
      card_type: 'VI',
    }
    const result = transformPaymentMethod(raw)
    expect(result.last4).toBeUndefined()
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
