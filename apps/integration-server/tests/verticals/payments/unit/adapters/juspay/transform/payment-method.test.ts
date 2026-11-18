import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawJuspayPaymentMethod,
} from '../../../../../../../src/verticals/payments/adapters/juspay/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('juspay transformPaymentMethod', () => {
  it('maps CARD type with card details', () => {
    const raw: RawJuspayPaymentMethod = {
      payment_method_type: 'CARD',
      payment_method: 'VISA',
      customer_id: 'cust-001',
      card: {
        card_brand: 'VISA',
        card_isin: '411111',
        card_type: 'CREDIT',
        card_issuer: 'HDFC Bank',
        name_on_card: 'Raj Kumar',
        expiry_month: '03',
        expiry_year: '2027',
        last_four_digits: '1111',
      },
      last_used: '2024-03-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('card')
    expect(result.brand).toBe('visa')
    expect(result.last4).toBe('1111')
    expect(result.expMonth).toBe(3)
    expect(result.expYear).toBe(2027)
    expect(result.holderName).toBe('Raj Kumar')
    expect(result.customerId).toBe('cust-001')
    expect(result.gateway).toBe('juspay')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps WALLET type', () => {
    const raw: RawJuspayPaymentMethod = {
      payment_method_type: 'WALLET',
      payment_method: 'PAYTM',
      customer_id: 'cust-002',
      wallet: {
        wallet: 'PAYTM',
        linked: true,
        current_balance: 500,
      },
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
    expect(result.brand).toBe('paytm')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps UPI_COLLECT type to "a2a"', () => {
    const raw: RawJuspayPaymentMethod = {
      payment_method_type: 'UPI_COLLECT',
      payment_method: 'UPI',
      customer_id: 'cust-003',
      upi: { vpa: 'user@okaxis' },
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('a2a')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps NB (NetBanking) to "bank_account"', () => {
    const raw: RawJuspayPaymentMethod = {
      payment_method_type: 'NB',
      payment_method: 'NB_HDFC',
      customer_id: 'cust-004',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bank_account')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
