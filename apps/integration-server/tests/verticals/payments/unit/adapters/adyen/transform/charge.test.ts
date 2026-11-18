import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawAdyenPaymentResponse,
} from '../../../../../../../src/verticals/payments/adapters/adyen/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('adyen transformCharge', () => {
  it('maps an Authorised payment to status "succeeded"', () => {
    const raw: RawAdyenPaymentResponse = {
      pspReference: 'PSP-001',
      merchantReference: 'ORDER-001',
      resultCode: 'Authorised',
      amount: { value: 2500, currency: 'usd' },
      shopperReference: 'SHOPPER-1',
      shopperEmail: 'buyer@example.com',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('USD')
    expect(result.id).toBe('PSP-001')
    expect(result.customerId).toBe('SHOPPER-1')
    expect(result.receiptEmail).toBe('buyer@example.com')
    expect(result.gateway).toBe('adyen')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a Refused payment to status "failed" with failure details', () => {
    const raw: RawAdyenPaymentResponse = {
      pspReference: 'PSP-002',
      resultCode: 'Refused',
      amount: { value: 1000, currency: 'eur' },
      refusalReason: 'Insufficient funds',
      refusalReasonCode: '24',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('24')
    expect(result.failureMessage).toBe('Insufficient funds')
    expect(result.currency).toBe('EUR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a Pending payment to status "pending"', () => {
    const raw: RawAdyenPaymentResponse = {
      pspReference: 'PSP-003',
      resultCode: 'Pending',
      amount: { value: 500, currency: 'gbp' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a Cancelled payment to status "cancelled"', () => {
    const raw: RawAdyenPaymentResponse = {
      pspReference: 'PSP-004',
      resultCode: 'Cancelled',
      amount: { value: 750, currency: 'usd' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
