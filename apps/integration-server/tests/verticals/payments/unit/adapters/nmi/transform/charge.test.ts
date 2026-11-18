import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawNmiTransaction,
} from '../../../../../../../src/verticals/payments/adapters/nmi/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('nmi transformCharge', () => {
  it('maps a Query API "complete" condition to status "succeeded"', () => {
    const raw: RawNmiTransaction = {
      transactionId: 'txn-001',
      condition: 'complete',
      amount: '49.99',
      currency: 'USD',
      email: 'buyer@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
      orderId: 'ORD-001',
      date: '20240301120000',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('txn-001')
    expect(result.externalId).toBe('txn-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.receiptEmail).toBe('buyer@example.com')
    expect(result.description).toBe('Jane Doe')
    expect(result.gateway).toBe('nmi')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a Query API "pendingsettlement" condition to status "pending"', () => {
    const raw: RawNmiTransaction = {
      transactionId: 'txn-002',
      condition: 'pendingsettlement',
      amount: '100.00',
      currency: 'USD',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(10000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a Query API "failed" condition to status "failed"', () => {
    const raw: RawNmiTransaction = {
      transactionId: 'txn-003',
      condition: 'failed',
      response: '2',
      responseText: 'Card declined',
      responseCode: '200',
      amount: '25.00',
      currency: 'USD',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('200')
    expect(result.failureMessage).toBe('Card declined')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a Payment API response "1" to status "succeeded" when no condition is set', () => {
    const raw: RawNmiTransaction = {
      transactionId: 'txn-004',
      response: '1',
      amount: '15.50',
      currency: 'USD',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(1550)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a "canceled" condition to status "cancelled"', () => {
    const raw: RawNmiTransaction = {
      transactionId: 'txn-005',
      condition: 'canceled',
      amount: '10.00',
      currency: 'USD',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('includes amountRefunded when amountRefunded > 0', () => {
    const raw: RawNmiTransaction = {
      transactionId: 'txn-006',
      condition: 'complete',
      amount: '50.00',
      amountRefunded: '20.00',
      currency: 'USD',
    }
    const result = transformCharge(raw)
    expect(result.amountRefunded).toBe(2000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to USD when absent or invalid', () => {
    const raw: RawNmiTransaction = {
      transactionId: 'txn-007',
      condition: 'complete',
      amount: '5.00',
    }
    const result = transformCharge(raw)
    expect(result.currency).toBe('USD')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
