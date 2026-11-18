import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawPaddlePaymentMethod,
} from '../../../../../../../src/verticals/payments/adapters/paddle/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('paddle transformPaymentMethod', () => {
  it('maps a Paddle card payment method to canonical PaymentMethod', () => {
    const raw: RawPaddlePaymentMethod = {
      id: 'paymtd_paddle_001',
      customer_id: 'ctm_001',
      address_id: 'add_001',
      type: 'card',
      card: {
        type: 'visa',
        last4: '4242',
        expiry_month: 12,
        expiry_year: 2027,
        cardholder_name: 'Alice Paddler',
      },
      origin: 'saved_during_purchase',
      saved_at: '2024-02-01T00:00:00Z',
      updated_at: '2024-06-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw)

    expect(result.id).toBe('paymtd_paddle_001')
    expect(result.externalId).toBe('paymtd_paddle_001')
    expect(result.customerId).toBe('ctm_001')
    expect(result.type).toBe('card')
    expect(result.brand).toBe('visa')
    expect(result.last4).toBe('4242')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2027)
    expect(result.holderName).toBe('Alice Paddler')
    expect(result.gateway).toBe('paddle')
    expect(result.metadata.paddle_type).toBe('card')
    expect(result.metadata.address_id).toBe('add_001')
    expect(result.metadata.origin).toBe('saved_during_purchase')
    expect(result.createdAt).toBe('2024-02-01T00:00:00Z')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a PayPal payment method to wallet type', () => {
    const raw: RawPaddlePaymentMethod = {
      id: 'paymtd_paddle_002',
      customer_id: 'ctm_002',
      type: 'paypal',
      paypal: {
        email: 'alice@paypal.test',
        reference: 'pp_ref_001',
      },
      saved_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw)

    expect(result.type).toBe('wallet')
    expect(result.holderName).toBe('alice@paypal.test')
    expect(result.metadata.paypal_reference).toBe('pp_ref_001')
    expect(result.metadata.paddle_type).toBe('paypal')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps apple_pay to wallet type', () => {
    const raw: RawPaddlePaymentMethod = {
      id: 'paymtd_paddle_003',
      customer_id: 'ctm_003',
      type: 'apple_pay',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps unknown type to other', () => {
    const raw: RawPaddlePaymentMethod = {
      id: 'paymtd_paddle_004',
      customer_id: 'ctm_004',
      type: 'bank_transfer',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('other')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('handles minimal input with no card or paypal data', () => {
    const raw: RawPaddlePaymentMethod = {
      id: 'paymtd_paddle_005',
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('paymtd_paddle_005')
    expect(result.type).toBe('other')
    expect(result.brand).toBeUndefined()
    expect(result.last4).toBeUndefined()
    expect(result.gateway).toBe('paddle')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
