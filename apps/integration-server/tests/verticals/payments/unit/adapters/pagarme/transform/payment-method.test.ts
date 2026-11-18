import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawPagarmeCard,
} from '../../../../../../../src/verticals/payments/adapters/pagarme/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('pagarme transformPaymentMethod', () => {
  it('maps core card fields to canonical payment method', () => {
    const raw: RawPagarmeCard = {
      id: 'card_abc',
      last_four_digits: '4242',
      first_six_digits: '411111',
      brand: 'Visa',
      holder_name: 'Ana Silva',
      exp_month: 12,
      exp_year: 2028,
      status: 'active',
      type: 'credit',
      customer: { id: 'cus_xyz' },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-02-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('card_abc')
    expect(result.externalId).toBe('card_abc')
    expect(result.type).toBe('card')
    expect(result.brand).toBe('Visa')
    expect(result.last4).toBe('4242')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2028)
    expect(result.holderName).toBe('Ana Silva')
    expect(result.customerId).toBe('cus_xyz')
    expect(result.gateway).toBe('pagarme')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('uses explicit customerId param over embedded customer', () => {
    const raw: RawPagarmeCard = {
      id: 'card_param',
      customer: { id: 'cus_embedded' },
    }
    const result = transformPaymentMethod(raw, 'cus_explicit')
    expect(result.customerId).toBe('cus_explicit')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('falls back to embedded customer id when param not provided', () => {
    const raw: RawPagarmeCard = {
      id: 'card_fallback',
      customer: { id: 'cus_embedded' },
    }
    const result = transformPaymentMethod(raw)
    expect(result.customerId).toBe('cus_embedded')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('puts card metadata fields into metadata map', () => {
    const raw: RawPagarmeCard = {
      id: 'card_meta',
      first_six_digits: '545454',
      holder_document: '123.456.789-00',
      status: 'active',
      type: 'debit',
      label: 'My Debit Card',
    }
    const result = transformPaymentMethod(raw)
    expect(result.metadata['first_six_digits']).toBe('545454')
    expect(result.metadata['holder_document']).toBe('123.456.789-00')
    expect(result.metadata['status']).toBe('active')
    expect(result.metadata['type']).toBe('debit')
    expect(result.metadata['label']).toBe('My Debit Card')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('handles minimal card with no optional fields', () => {
    const raw: RawPagarmeCard = {
      id: 'card_min',
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('card_min')
    expect(result.type).toBe('card')
    expect(result.brand).toBeUndefined()
    expect(result.last4).toBeUndefined()
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
