import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawComputopPayment,
} from '../../../../../../../src/verticals/payments/adapters/computop/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('computop transformCharge', () => {
  it('maps an "OK" payment to status "succeeded"', () => {
    const raw: RawComputopPayment = {
      payId: 'pay-001',
      transId: 'trans-001',
      status: 'OK',
      amount: { value: 5000, currency: 'EUR', capturedValue: 5000, refundedValue: 0 },
      customerInfo: { gatewayCustomerId: 'cus-001', email: 'buyer@example.com' },
      order: { creationDate: '2024-03-01T00:00:00Z' },
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('pay-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('EUR')
    expect(result.customerId).toBe('cus-001')
    expect(result.receiptEmail).toBe('buyer@example.com')
    expect(result.gateway).toBe('computop')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a "CAPTURED" payment to status "succeeded"', () => {
    const raw: RawComputopPayment = {
      payId: 'pay-002',
      status: 'CAPTURED',
      amount: { value: 10000, currency: 'USD', capturedValue: 10000, refundedValue: 0 },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.currency).toBe('USD')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps "AUTHORIZED" to status "pending"', () => {
    const raw: RawComputopPayment = {
      payId: 'pay-003',
      status: 'AUTHORIZED',
      amount: { value: 3000, currency: 'EUR', capturedValue: 0, refundedValue: 0 },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps "FAILED" to status "failed" with failure info', () => {
    const raw: RawComputopPayment = {
      payId: 'pay-004',
      status: 'FAILED',
      responseCode: '0050',
      responseDescription: 'Card declined',
      amount: { value: 2000, currency: 'EUR', capturedValue: 0, refundedValue: 0 },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('0050')
    expect(result.failureMessage).toBe('Card declined')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps "REFUNDED" with partial refund to "partially_refunded"', () => {
    const raw: RawComputopPayment = {
      payId: 'pay-005',
      status: 'REFUNDED',
      amount: { value: 10000, currency: 'EUR', capturedValue: 10000, refundedValue: 5000 },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('partially_refunded')
    expect(result.amountRefunded).toBe(5000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps "CANCELLED" to status "cancelled"', () => {
    const raw: RawComputopPayment = {
      payId: 'pay-006',
      status: 'CANCELLED',
      amount: { value: 1500, currency: 'USD' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
