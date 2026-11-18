import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawStaxPaymentMethod,
} from '../../../../../../../src/verticals/payments/adapters/stax-payments/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('stax-payments transformPaymentMethod', () => {
  it('maps a card payment method with expiry from card_exp', () => {
    const raw: RawStaxPaymentMethod = {
      id: 'pm_stax_1',
      customer_id: 'cus_stax_1',
      method: 'card',
      card_type: 'Visa',
      card_last_four: '4242',
      card_exp: '1228',
      person_name: 'Alice Smith',
      default: true,
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('pm_stax_1')
    expect(result.type).toBe('card')
    expect(result.brand).toBe('Visa')
    expect(result.last4).toBe('4242')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2028)
    expect(result.holderName).toBe('Alice Smith')
    expect(result.isDefault).toBe(true)
    expect(result.gateway).toBe('stax-payments')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a bank account (ACH) payment method', () => {
    const raw: RawStaxPaymentMethod = {
      id: 'pm_stax_2',
      customer_id: 'cus_stax_2',
      method: 'ach',
      bank_name: 'Bank of America',
      card_last_four: '6789',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bank_account')
    expect(result.bankName).toBe('Bank of America')
    expect(result.last4).toBe('6789')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('handles isDefault with numeric 1', () => {
    const raw: RawStaxPaymentMethod = {
      id: 'pm_stax_3',
      method: 'credit',
      card_last_four: '1111',
      default: 1,
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('card')
    expect(result.isDefault).toBe(true)
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps customer_id correctly', () => {
    const raw: RawStaxPaymentMethod = {
      id: 'pm_stax_4',
      customer_id: 'cus_stax_4',
      method: 'debit',
      card_last_four: '9999',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw)
    expect(result.customerId).toBe('cus_stax_4')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
