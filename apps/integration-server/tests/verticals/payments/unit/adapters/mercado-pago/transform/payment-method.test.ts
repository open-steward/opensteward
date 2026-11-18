import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawMPCard,
} from '../../../../../../../src/verticals/payments/adapters/mercado-pago/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('mercado-pago transformPaymentMethod', () => {
  const base: RawMPCard = {
    id: 'card-mp-001',
    customer_id: 'cust-abc-123',
    last_four_digits: '4242',
    expiration_month: 12,
    expiration_year: 2027,
    payment_method: { id: 'visa', name: 'Visa', type: 'credit_card' },
    cardholder: { name: 'Maria Gonzalez' },
    date_created: '2023-09-01T10:00:00.000Z',
  }

  it('maps id and customerId', () => {
    const result = transformPaymentMethod(base)
    expect(result.id).toBe('card-mp-001')
    expect(result.customerId).toBe('cust-abc-123')
  })

  it('maps credit_card type to card', () => {
    const result = transformPaymentMethod(base)
    expect(result.type).toBe('card')
  })

  it('maps last4, expMonth, expYear, brand, holderName', () => {
    const result = transformPaymentMethod(base)
    expect(result.last4).toBe('4242')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2027)
    expect(result.brand).toBe('Visa')
    expect(result.holderName).toBe('Maria Gonzalez')
  })

  it('maps bank_transfer type to bank_account', () => {
    const result = transformPaymentMethod({
      ...base,
      payment_method: { id: 'pix', name: 'Pix', type: 'bank_transfer' },
    })
    expect(result.type).toBe('bank_account')
  })

  it('maps digital_wallet type to wallet', () => {
    const result = transformPaymentMethod({
      ...base,
      payment_method: { id: 'mercadopago', name: 'MercadoPago', type: 'digital_wallet' },
    })
    expect(result.type).toBe('wallet')
  })

  it('puts payment_method_id in metadata', () => {
    const result = transformPaymentMethod(base)
    expect(result.metadata['payment_method_id']).toBe('visa')
  })

  it('sets gateway to mercado-pago', () => {
    const result = transformPaymentMethod(base)
    expect(result.gateway).toBe('mercado-pago')
  })

  it('conforms to PaymentMethodSchema', () => {
    expect(() => PaymentMethodSchema.parse(transformPaymentMethod(base))).not.toThrow()
  })
})
