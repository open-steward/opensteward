import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawMyfatoorahCard,
} from '../../../../../../../src/verticals/payments/adapters/myfatoorah/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('myfatoorah transformPaymentMethod', () => {
  it('maps a Visa card with all fields', () => {
    const raw: RawMyfatoorahCard = {
      Token: 'tok-001',
      PanHash: 'hash-abc123',
      Brand: 'visa',
      Number: '512345xxxxxx0008',
      ExpiryMonth: '12',
      ExpiryYear: '2028',
      NameOnCard: 'Ahmed Al-Mansouri',
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('tok-001')
    expect(result.externalId).toBe('tok-001')
    expect(result.type).toBe('card')
    expect(result.brand).toBe('visa')
    expect(result.last4).toBe('0008')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2028)
    expect(result.holderName).toBe('Ahmed Al-Mansouri')
    expect(result.fingerprint).toBe('hash-abc123')
    expect(result.gateway).toBe('myfatoorah')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a knet card brand to type "card"', () => {
    const raw: RawMyfatoorahCard = {
      Token: 'tok-002',
      Brand: 'knet',
      Number: '1234xxxx5678',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('card')
    expect(result.last4).toBe('5678')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps apple_pay to type "wallet"', () => {
    const raw: RawMyfatoorahCard = {
      Token: 'tok-003',
      Brand: 'apple_pay',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps google_pay to type "wallet"', () => {
    const raw: RawMyfatoorahCard = {
      Token: 'tok-004',
      Brand: 'google_pay',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('falls back to PanHash for id when Token is missing', () => {
    const raw: RawMyfatoorahCard = {
      PanHash: 'hash-fallback',
      Brand: 'mada',
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('hash-fallback')
    expect(result.externalId).toBe('hash-fallback')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('returns undefined last4 when Number has fewer than 4 digits', () => {
    const raw: RawMyfatoorahCard = {
      Token: 'tok-005',
      Brand: 'visa',
      Number: '12',
    }
    const result = transformPaymentMethod(raw)
    expect(result.last4).toBeUndefined()
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('returns undefined expMonth for invalid month value', () => {
    const raw: RawMyfatoorahCard = {
      Token: 'tok-006',
      Brand: 'visa',
      ExpiryMonth: '13',
      ExpiryYear: '2028',
    }
    const result = transformPaymentMethod(raw)
    expect(result.expMonth).toBeUndefined()
    expect(result.expYear).toBe(2028)
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
