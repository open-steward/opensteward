import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawStripePaymentMethod,
} from '../../../../../../../src/verticals/payments/adapters/stitch/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('stitch transformPaymentMethod', () => {
  it('maps id, type card, and gateway fields', () => {
    const raw: RawStripePaymentMethod = {
      id: 'pm_stitch_001',
      object: 'payment_method',
      type: 'card',
      card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2028, fingerprint: 'fp_abc' },
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('pm_stitch_001')
    expect(result.externalId).toBe('pm_stitch_001')
    expect(result.type).toBe('card')
    expect(result.brand).toBe('visa')
    expect(result.last4).toBe('4242')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2028)
    expect(result.fingerprint).toBe('fp_abc')
    expect(result.gateway).toBe('stripe')
  })

  it('maps us_bank_account to type "bank_account"', () => {
    const raw: RawStripePaymentMethod = {
      id: 'pm_stitch_002',
      object: 'payment_method',
      type: 'us_bank_account',
      us_bank_account: { bank_name: 'Chase', last4: '6789', fingerprint: 'fp_bank' },
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bank_account')
    expect(result.bankName).toBe('Chase')
    expect(result.last4).toBe('6789')
    expect(result.fingerprint).toBe('fp_bank')
  })

  it('maps klarna to type "bnpl"', () => {
    const raw: RawStripePaymentMethod = {
      id: 'pm_stitch_003',
      object: 'payment_method',
      type: 'klarna',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bnpl')
  })

  it('maps apple_pay to type "wallet"', () => {
    const raw: RawStripePaymentMethod = {
      id: 'pm_stitch_004',
      object: 'payment_method',
      type: 'apple_pay',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
  })

  it('maps unknown type to "other"', () => {
    const raw: RawStripePaymentMethod = {
      id: 'pm_stitch_005',
      object: 'payment_method',
      type: 'some_unknown_type',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('other')
  })

  it('maps customerId from customer field', () => {
    const raw: RawStripePaymentMethod = {
      id: 'pm_stitch_006',
      object: 'payment_method',
      type: 'card',
      customer: 'cus_001',
    }
    const result = transformPaymentMethod(raw)
    expect(result.customerId).toBe('cus_001')
  })

  it('maps holderName from billing_details.name', () => {
    const raw: RawStripePaymentMethod = {
      id: 'pm_stitch_007',
      object: 'payment_method',
      type: 'card',
      billing_details: { name: 'Jane Doe' },
    }
    const result = transformPaymentMethod(raw)
    expect(result.holderName).toBe('Jane Doe')
  })

  it('converts unix created to ISO string', () => {
    const raw: RawStripePaymentMethod = {
      id: 'pm_stitch_008',
      object: 'payment_method',
      type: 'card',
      created: 1709251200,
    }
    const result = transformPaymentMethod(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('passes PaymentMethodSchema validation', () => {
    const raw: RawStripePaymentMethod = {
      id: 'pm_stitch_009',
      object: 'payment_method',
      type: 'card',
      customer: 'cus_001',
      card: { brand: 'mastercard', last4: '1234', exp_month: 6, exp_year: 2027 },
      billing_details: { name: 'Bob Smith' },
      created: 1709251200,
      metadata: { source: 'checkout' },
    }
    const result = transformPaymentMethod(raw)
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
