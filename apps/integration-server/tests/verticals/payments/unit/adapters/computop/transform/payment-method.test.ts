import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawComputopPaymentMethod,
} from '../../../../../../../src/verticals/payments/adapters/computop/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('computop transformPaymentMethod', () => {
  it('maps a CARD payment method', () => {
    const raw: RawComputopPaymentMethod = {
      id: 'pm-001',
      type: 'CARD',
      brand: 'Visa',
      last4Digits: '4242',
      cardHolderName: 'Jane Doe',
      expiryDate: '12/28',
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw, 'cu-001')
    expect(result.id).toBe('pm-001')
    expect(result.type).toBe('card')
    expect(result.brand).toBe('visa')
    expect(result.last4).toBe('4242')
    expect(result.holderName).toBe('Jane Doe')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2028)
    expect(result.customerId).toBe('cu-001')
    expect(result.gateway).toBe('computop')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a SEPA_DD payment method to bank_account type', () => {
    const raw: RawComputopPaymentMethod = {
      id: 'pm-002',
      type: 'SEPA_DD',
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bank_account')
    expect(result.customerId).toBeUndefined()
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps unknown type to "other"', () => {
    const raw: RawComputopPaymentMethod = {
      id: 'pm-003',
      type: 'PAYPAL',
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('other')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('parses YYYY-MM expiry format correctly', () => {
    const raw: RawComputopPaymentMethod = {
      id: 'pm-004',
      type: 'CARD',
      expiryDate: '2029-06',
      last4Digits: '1234',
    }
    const result = transformPaymentMethod(raw)
    expect(result.expMonth).toBe(6)
    expect(result.expYear).toBe(2029)
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
