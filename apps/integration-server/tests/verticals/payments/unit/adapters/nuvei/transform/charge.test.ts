import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawNuveiTransaction,
} from '../../../../../../../src/verticals/payments/adapters/nuvei/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('nuvei transformCharge', () => {
  it('maps fields to canonical charge for an APPROVED SALE transaction', () => {
    const raw: RawNuveiTransaction = {
      transactionId: 'txn_001',
      orderId: 'order_abc',
      transactionStatus: 'APPROVED',
      transactionType: 'SALE',
      amount: '10.50',
      currency: 'usd',
      userPaymentOptionId: 'upo_42',
      createdDate: '2024-03-01T00:00:00Z',
      updatedDate: '2024-03-01T01:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('txn_001')
    expect(result.externalId).toBe('txn_001')
    expect(result.amount).toBe(1050)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.captured).toBe(true)
    expect(result.paymentMethodId).toBe('upo_42')
    expect(result.gateway).toBe('nuvei')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps DECLINED transactionStatus to failed and includes failure message', () => {
    const raw: RawNuveiTransaction = {
      transactionId: 'txn_002',
      transactionStatus: 'DECLINED',
      amount: '20.00',
      currency: 'EUR',
      errCode: 1001,
      gwErrorReason: 'Insufficient funds',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureMessage).toBe('Insufficient funds')
    expect(result.amount).toBe(2000)
    expect(result.currency).toBe('EUR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps PENDING transactionStatus to pending', () => {
    const raw: RawNuveiTransaction = {
      transactionId: 'txn_003',
      transactionStatus: 'PENDING',
      amount: '5.00',
      currency: 'GBP',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.captured).toBeUndefined()
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('falls back to orderId then clientUniqueId for id when transactionId is absent', () => {
    const raw: RawNuveiTransaction = {
      orderId: 'order_xyz',
      clientUniqueId: 'client_123',
      transactionStatus: 'APPROVED',
      amount: '1.00',
      currency: 'USD',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('order_xyz')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('falls back to clientUniqueId for id when both transactionId and orderId are absent', () => {
    const raw: RawNuveiTransaction = {
      clientUniqueId: 'client_only',
      transactionStatus: 'APPROVED',
      amount: '2.00',
      currency: 'USD',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('client_only')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('uses request-level status=SUCCESS when transactionStatus is absent', () => {
    const raw: RawNuveiTransaction = {
      transactionId: 'txn_004',
      status: 'SUCCESS',
      amount: '3.00',
      currency: 'USD',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('defaults to USD when currency is absent', () => {
    const raw: RawNuveiTransaction = {
      transactionId: 'txn_005',
      transactionStatus: 'APPROVED',
      amount: '1.00',
    }
    const result = transformCharge(raw)
    expect(result.currency).toBe('USD')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('marks AUTH transaction as not captured', () => {
    const raw: RawNuveiTransaction = {
      transactionId: 'txn_006',
      transactionStatus: 'APPROVED',
      transactionType: 'Auth',
      amount: '50.00',
      currency: 'USD',
    }
    const result = transformCharge(raw)
    expect(result.captured).toBe(false)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps card details from paymentOption into metadata', () => {
    const raw: RawNuveiTransaction = {
      transactionId: 'txn_007',
      transactionStatus: 'APPROVED',
      transactionType: 'SALE',
      amount: '9.99',
      currency: 'USD',
      paymentOption: {
        userPaymentOptionId: 'upo_99',
        card: {
          last4Digits: '4242',
          cardBrand: 'VISA',
          cardHolderName: 'John Smith',
        },
      },
    }
    const result = transformCharge(raw)
    expect(result.paymentMethodId).toBe('upo_99')
    expect(result.metadata.cardLast4).toBe('4242')
    expect(result.metadata.paymentMethodName).toBe('VISA')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
