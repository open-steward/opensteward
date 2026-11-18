import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawTapCard,
} from '../../../../../../../src/verticals/payments/adapters/tap-payments/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('tap-payments transformPaymentMethod', () => {
  it('maps a VISA card correctly', () => {
    const raw: RawTapCard = {
      id: 'card_001',
      customer: 'cus_001',
      brand: 'VISA',
      last_four: '4242',
      exp_month: 12,
      exp_year: 28,
      name: 'Jane Doe',
      fingerprint: 'fp_abc123',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('card')
    expect(result.brand).toBe('visa')
    expect(result.last4).toBe('4242')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2028)
    expect(result.customerId).toBe('cus_001')
    expect(result.holderName).toBe('Jane Doe')
    expect(result.fingerprint).toBe('fp_abc123')
    expect(result.gateway).toBe('tap-payments')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps APPLE_PAY brand to type "wallet"', () => {
    const raw: RawTapCard = {
      id: 'card_002',
      brand: 'APPLE_PAY',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps GOOGLE_PAY brand to type "wallet"', () => {
    const raw: RawTapCard = {
      id: 'card_003',
      brand: 'GOOGLE_PAY',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('normalizes 2-digit exp_year to 4-digit', () => {
    const raw: RawTapCard = {
      id: 'card_004',
      brand: 'MASTERCARD',
      exp_year: 30,
    }
    const result = transformPaymentMethod(raw)
    expect(result.expYear).toBe(2030)
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('lowercases the brand string', () => {
    const raw: RawTapCard = {
      id: 'card_005',
      brand: 'MASTERCARD',
    }
    const result = transformPaymentMethod(raw)
    expect(result.brand).toBe('mastercard')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
