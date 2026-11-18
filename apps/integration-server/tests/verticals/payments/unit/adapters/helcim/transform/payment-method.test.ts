import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawHelcimCard,
} from '../../../../../../../src/verticals/payments/adapters/helcim/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('helcim transformPaymentMethod', () => {
  it('maps a card with MMYY expiry and F6L4 number', () => {
    const raw: RawHelcimCard = {
      id: 701,
      cardToken: 'tok-visa-001',
      cardF6L4: '411111XXXXXX1234',
      cardHolderName: 'Jane Doe',
      cardExpiry: '1226',
      dateCreated: '2024-03-01 00:00:00',
      dateUpdated: '2024-03-01 00:00:00',
    }
    const result = transformPaymentMethod(raw, 'cust-001')
    expect(result.id).toBe('701')
    expect(result.externalId).toBe('tok-visa-001')
    expect(result.type).toBe('card')
    expect(result.last4).toBe('1234')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2026)
    expect(result.holderName).toBe('Jane Doe')
    expect(result.customerId).toBe('cust-001')
    expect(result.fingerprint).toBe('tok-visa-001')
    expect(result.gateway).toBe('helcim')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a card without customerId (caller did not provide)', () => {
    const raw: RawHelcimCard = {
      id: 702,
      cardToken: 'tok-mc-002',
      cardF6L4: '555555XXXXXX4444',
      cardExpiry: '0128',
    }
    const result = transformPaymentMethod(raw)
    expect(result.customerId).toBeUndefined()
    expect(result.expMonth).toBe(1)
    expect(result.expYear).toBe(2028)
    expect(result.last4).toBe('4444')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('handles a card with no expiry gracefully', () => {
    const raw: RawHelcimCard = {
      id: 703,
      cardToken: 'tok-003',
    }
    const result = transformPaymentMethod(raw)
    expect(result.expMonth).toBeUndefined()
    expect(result.expYear).toBeUndefined()
    expect(result.last4).toBeUndefined()
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('uses cardToken as id when numeric id is absent', () => {
    const raw: RawHelcimCard = {
      cardToken: 'tok-only-004',
      cardF6L4: '378282XXXXX4197',
      cardExpiry: '0325',
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('tok-only-004')
    expect(result.externalId).toBe('tok-only-004')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
