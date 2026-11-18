import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawStripePaymentMethod,
} from '../../../../../../../src/verticals/payments/adapters/sumup/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('sumup transformPaymentMethod', () => {
  it('maps a card payment method', () => {
    const raw: RawStripePaymentMethod = {
      id: 'pm_001',
      object: 'payment_method',
      type: 'card',
      customer: 'cus_abc',
      card: {
        brand: 'visa',
        last4: '4242',
        exp_month: 12,
        exp_year: 2027,
        fingerprint: 'fp_001',
      },
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('pm_001')
    expect(result.externalId).toBe('pm_001')
    expect(result.type).toBe('card')
    expect(result.brand).toBe('visa')
    expect(result.last4).toBe('4242')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2027)
    expect(result.fingerprint).toBe('fp_001')
    expect(result.customerId).toBe('cus_abc')
    expect(result.gateway).toBe('stripe')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a us_bank_account to type bank_account', () => {
    const raw: RawStripePaymentMethod = {
      id: 'pm_002',
      object: 'payment_method',
      type: 'us_bank_account',
      us_bank_account: {
        bank_name: 'Chase',
        last4: '6789',
        fingerprint: 'fp_bank',
      },
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bank_account')
    expect(result.last4).toBe('6789')
    expect(result.bankName).toBe('Chase')
    expect(result.fingerprint).toBe('fp_bank')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps klarna to type bnpl', () => {
    const raw: RawStripePaymentMethod = {
      id: 'pm_003',
      object: 'payment_method',
      type: 'klarna',
    }
    expect(transformPaymentMethod(raw).type).toBe('bnpl')
  })

  it('maps apple_pay to type wallet', () => {
    const raw: RawStripePaymentMethod = {
      id: 'pm_004',
      object: 'payment_method',
      type: 'apple_pay',
    }
    expect(transformPaymentMethod(raw).type).toBe('wallet')
  })

  it('maps unknown type to other', () => {
    const raw: RawStripePaymentMethod = {
      id: 'pm_005',
      object: 'payment_method',
      type: 'custom_method',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('other')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps holderName from billing_details.name and createdAt', () => {
    const raw: RawStripePaymentMethod = {
      id: 'pm_006',
      object: 'payment_method',
      type: 'card',
      billing_details: { name: 'John Smith' },
      created: 1709251200,
    }
    const result = transformPaymentMethod(raw)
    expect(result.holderName).toBe('John Smith')
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })
})
