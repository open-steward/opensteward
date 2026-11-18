import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawRecurlyBillingInfo,
} from '../../../../../../../src/verticals/payments/adapters/recurly/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('recurly transformPaymentMethod', () => {
  it('maps a credit card billing info to card type', () => {
    const raw: RawRecurlyBillingInfo = {
      id: 'bi-001',
      account: { id: 'acc-001', code: 'code-001' },
      payment_method: {
        object: 'credit_card',
        card_type: 'Visa',
        last_four: '4242',
        exp_month: 12,
        exp_year: 2026,
        first_six: '424242',
      },
      first_name: 'Jane',
      last_name: 'Doe',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('bi-001')
    expect(result.type).toBe('card')
    expect(result.brand).toBe('Visa')
    expect(result.last4).toBe('4242')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2026)
    expect(result.holderName).toBe('Jane Doe')
    expect(result.customerId).toBe('acc-001')
    expect(result.gateway).toBe('recurly')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a paypal billing agreement to wallet type', () => {
    const raw: RawRecurlyBillingInfo = {
      id: 'bi-002',
      account: { id: 'acc-002' },
      payment_method: {
        object: 'paypal_billing_agreement',
        billing_agreement_id: 'ba-001',
      },
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a bank account to bank_account type', () => {
    const raw: RawRecurlyBillingInfo = {
      id: 'bi-003',
      account: { id: 'acc-003' },
      payment_method: {
        object: 'bank_account_info',
      },
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bank_account')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
