import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawIyzicoPayment,
} from '../../../../../../../src/verticals/payments/adapters/iyzico/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('iyzico transformCharge', () => {
  it('maps paymentStatus SUCCESS to "succeeded" and converts paidPrice', () => {
    const raw: RawIyzicoPayment = {
      status: 'success',
      paymentId: 'pay-001',
      paymentStatus: 'SUCCESS',
      paidPrice: 49.99,
      price: 49.99,
      currency: 'TRY',
      createdDate: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('TRY')
    expect(result.gateway).toBe('iyzico')
    expect(result.id).toBe('pay-001')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps paymentStatus FAILURE to "failed" and captures error fields', () => {
    const raw: RawIyzicoPayment = {
      status: 'success',
      paymentId: 'pay-002',
      paymentStatus: 'FAILURE',
      paidPrice: 0,
      currency: 'USD',
      errorCode: 'CARD_DECLINED',
      errorMessage: 'Card was declined by issuer',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('CARD_DECLINED')
    expect(result.failureMessage).toBe('Card was declined by issuer')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps top-level status failure to "failed"', () => {
    const raw: RawIyzicoPayment = {
      status: 'failure',
      paymentId: 'pay-003',
      currency: 'EUR',
      errorMessage: 'API error',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps paymentStatus INIT_THREEDS to "pending"', () => {
    const raw: RawIyzicoPayment = {
      status: 'success',
      paymentId: 'pay-004',
      paymentStatus: 'INIT_THREEDS',
      paidPrice: 100,
      currency: 'TRY',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('captures refundIds from itemTransactions', () => {
    const raw: RawIyzicoPayment = {
      status: 'success',
      paymentId: 'pay-005',
      paymentStatus: 'SUCCESS',
      paidPrice: 20,
      currency: 'TRY',
      itemTransactions: [
        { paymentTransactionId: 'txn-1', price: 10 },
        { paymentTransactionId: 'txn-2', price: 10 },
      ],
    }
    const result = transformCharge(raw)
    expect(result.refundIds).toEqual(['txn-1', 'txn-2'])
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
