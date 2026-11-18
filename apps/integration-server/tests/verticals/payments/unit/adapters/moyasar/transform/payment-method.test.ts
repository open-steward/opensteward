import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawMoyasarToken,
} from '../../../../../../../src/verticals/payments/adapters/moyasar/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('moyasar transformPaymentMethod', () => {
  it('maps id, brand as card type, last_four, expiry, and holderName', () => {
    const raw: RawMoyasarToken = {
      id: 'tok-001',
      brand: 'visa',
      last_four: '1234',
      month: '12',
      year: '2028',
      name: 'Ali Hassan',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('tok-001')
    expect(result.type).toBe('card')
    expect(result.brand).toBe('visa')
    expect(result.last4).toBe('1234')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2028)
    expect(result.holderName).toBe('Ali Hassan')
    expect(result.gateway).toBe('moyasar')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps stc_pay brand to wallet type', () => {
    const raw: RawMoyasarToken = {
      id: 'tok-002',
      brand: 'stc_pay',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
    expect(result.brand).toBe('stc_pay')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('defaults to card type when brand is absent', () => {
    const raw: RawMoyasarToken = {
      id: 'tok-003',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('card')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
