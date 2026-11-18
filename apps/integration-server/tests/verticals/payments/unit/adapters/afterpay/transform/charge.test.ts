import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawAfterpayPayment,
} from '../../../../../../../src/verticals/payments/adapters/afterpay/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('afterpay transformCharge', () => {
  it('maps status "CAPTURED" to "succeeded" and converts decimal amount to minor units', () => {
    const raw: RawAfterpayPayment = {
      id: 'ap-pay-001',
      token: 'token-001',
      status: 'CAPTURED',
      totalAmount: { amount: '49.99', currency: 'USD' },
      refundedAmount: { amount: '0.00' },
      orderDetails: {
        consumer: { email: 'buyer@example.com', givenNames: 'Jane', surname: 'Doe' },
      },
      merchantReference: 'ord-001',
      created: '2024-03-01T12:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('afterpay')
    expect(result.receiptEmail).toBe('buyer@example.com')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status "APPROVED" to "succeeded"', () => {
    const raw: RawAfterpayPayment = {
      id: 'ap-pay-002',
      status: 'APPROVED',
      totalAmount: { amount: '20.00', currency: 'AUD' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.currency).toBe('AUD')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status "AUTH_APPROVED" to "pending"', () => {
    const raw: RawAfterpayPayment = {
      id: 'ap-pay-003',
      status: 'AUTH_APPROVED',
      totalAmount: { amount: '15.00', currency: 'GBP' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status "DECLINED" to "failed"', () => {
    const raw: RawAfterpayPayment = {
      id: 'ap-pay-004',
      status: 'DECLINED',
      totalAmount: { amount: '10.00', currency: 'USD' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status "VOIDED" to "cancelled"', () => {
    const raw: RawAfterpayPayment = {
      id: 'ap-pay-005',
      status: 'VOIDED',
      totalAmount: { amount: '30.00', currency: 'CAD' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status "REFUNDED" to "refunded"', () => {
    const raw: RawAfterpayPayment = {
      id: 'ap-pay-006',
      status: 'REFUNDED',
      totalAmount: { amount: '50.00', currency: 'USD' },
      refundedAmount: { amount: '50.00' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(result.amountRefunded).toBe(5000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status "PARTIALLY_REFUNDED" to "partially_refunded"', () => {
    const raw: RawAfterpayPayment = {
      id: 'ap-pay-007',
      status: 'PARTIALLY_REFUNDED',
      totalAmount: { amount: '100.00', currency: 'USD' },
      refundedAmount: { amount: '25.00' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('partially_refunded')
    expect(result.amountRefunded).toBe(2500)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('builds description from consumer name and falls back to merchantReference', () => {
    const rawWithName: RawAfterpayPayment = {
      id: 'ap-pay-008',
      status: 'CAPTURED',
      totalAmount: { amount: '10.00', currency: 'USD' },
      orderDetails: { consumer: { givenNames: 'Alice', surname: 'Smith' } },
      merchantReference: 'ord-008',
    }
    const resultWithName = transformCharge(rawWithName)
    expect(resultWithName.description).toBe('Alice Smith')

    const rawNoName: RawAfterpayPayment = {
      id: 'ap-pay-009',
      status: 'CAPTURED',
      totalAmount: { amount: '10.00', currency: 'USD' },
      merchantReference: 'ord-009',
    }
    const resultNoName = transformCharge(rawNoName)
    expect(resultNoName.description).toBe('ord-009')
    expect(() => ChargeSchema.parse(resultNoName)).not.toThrow()
  })

  it('falls back to USD when currency is absent', () => {
    const raw: RawAfterpayPayment = {
      id: 'ap-pay-010',
      status: 'CAPTURED',
      totalAmount: { amount: '5.00' },
    }
    const result = transformCharge(raw)
    expect(result.currency).toBe('USD')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('uses id field and falls back to token for id/externalId', () => {
    const rawWithToken: RawAfterpayPayment = {
      token: 'token-only',
      status: 'PENDING',
      totalAmount: { amount: '10.00', currency: 'USD' },
    }
    const result = transformCharge(rawWithToken)
    expect(result.id).toBe('token-only')
    expect(result.externalId).toBe('token-only')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
