import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawIuguPaymentMethod,
} from '../../../../../../../src/verticals/payments/adapters/iugu/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('iugu transformPaymentMethod', () => {
  it('maps a credit card payment method', () => {
    const raw: RawIuguPaymentMethod = {
      id: 'pm-001',
      customer_id: 'cust-001',
      method_type: 'credit_card',
      set_as_default: true,
      data: {
        last_digits: '4242',
        brand: 'visa',
        holder_name: 'João Silva',
        month: '12',
        year: '2028',
      },
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('pm-001')
    expect(result.type).toBe('card')
    expect(result.last4).toBe('4242')
    expect(result.brand).toBe('visa')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2028)
    expect(result.holderName).toBe('João Silva')
    expect(result.isDefault).toBe(true)
    expect(result.customerId).toBe('cust-001')
    expect(result.gateway).toBe('iugu')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a bank_slip (boleto) to "bank_account" type', () => {
    const raw: RawIuguPaymentMethod = {
      id: 'pm-002',
      method_type: 'boleto',
      data: {},
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bank_account')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a pix to "a2a" type', () => {
    const raw: RawIuguPaymentMethod = {
      id: 'pm-003',
      method_type: 'pix',
      data: {},
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('a2a')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps unknown method_type to "other"', () => {
    const raw: RawIuguPaymentMethod = {
      id: 'pm-004',
      method_type: 'crypto',
      data: {},
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('other')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('sets isDefault from "default" field', () => {
    const raw: RawIuguPaymentMethod = {
      id: 'pm-005',
      method_type: 'credit_card',
      default: true,
      data: {},
    }
    const result = transformPaymentMethod(raw)
    expect(result.isDefault).toBe(true)
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
