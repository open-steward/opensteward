import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawHyperpayPayment,
} from '../../../../../../../src/verticals/payments/adapters/hyperpay/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('hyperpay transformCharge', () => {
  it('maps a successful DB (debit) payment to status "succeeded" with captured=true', () => {
    const raw: RawHyperpayPayment = {
      id: 'hp-pay-001',
      paymentType: 'DB',
      paymentBrand: 'VISA',
      amount: '92.00',
      currency: 'USD',
      descriptor: 'Order #42',
      merchantTransactionId: 'ord-42',
      result: { code: '000.000.000', description: 'Transaction succeeded' },
      card: {
        bin: '411111',
        last4Digits: '1111',
        holder: 'Jane Doe',
        expiryMonth: '12',
        expiryYear: '2028',
      },
      customer: {
        email: 'jane@example.com',
        givenName: 'Jane',
        surname: 'Doe',
      },
      timestamp: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(9200)
    expect(result.currency).toBe('USD')
    expect(result.captured).toBe(true)
    expect(result.amountCaptured).toBe(9200)
    expect(result.gateway).toBe('hyperpay')
    expect(result.receiptEmail).toBe('jane@example.com')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a rejected result to status "failed" with failureCode', () => {
    const raw: RawHyperpayPayment = {
      id: 'hp-pay-002',
      paymentType: 'DB',
      paymentBrand: 'MASTER',
      amount: '10.00',
      currency: 'SAR',
      result: { code: '800.100.152', description: 'Card declined' },
      timestamp: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.captured).toBe(false)
    expect(result.failureCode).toBe('800.100.152')
    expect(result.failureMessage).toBe('Card declined')
    expect(result.amountCaptured).toBe(0)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a PA (preauthorization) to status "pending"', () => {
    const raw: RawHyperpayPayment = {
      id: 'hp-pay-003',
      paymentType: 'PA',
      paymentBrand: 'VISA',
      amount: '50.00',
      currency: 'USD',
      result: { code: '000.000.000', description: 'Transaction succeeded' },
      timestamp: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.captured).toBe(false)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an RV (reversal) to status "cancelled"', () => {
    const raw: RawHyperpayPayment = {
      id: 'hp-pay-004',
      paymentType: 'RV',
      amount: '30.00',
      currency: 'USD',
      result: { code: '000.000.000', description: 'Transaction succeeded' },
      timestamp: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
