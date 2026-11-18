import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawHelcimTransaction,
} from '../../../../../../../src/verticals/payments/adapters/helcim/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('helcim transformCharge', () => {
  it('maps an APPROVED purchase to status "succeeded" with captured=true', () => {
    const raw: RawHelcimTransaction = {
      transactionId: 12345,
      status: 'APPROVED',
      type: 'purchase',
      amount: 49.99,
      currency: 'CAD',
      customerCode: 'cust-001',
      cardToken: 'tok-001',
      invoiceNumber: 'INV-001',
      cardHolderName: 'Jane Doe',
      dateCreated: '2024-03-01 00:00:00',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('CAD')
    expect(result.captured).toBe(true)
    expect(result.customerId).toBe('cust-001')
    expect(result.paymentMethodId).toBe('tok-001')
    expect(result.invoiceId).toBe('INV-001')
    expect(result.gateway).toBe('helcim')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an APPROVED preauth to captured=false', () => {
    const raw: RawHelcimTransaction = {
      transactionId: 12346,
      status: 'APPROVED',
      type: 'preauth',
      amount: 20.0,
      currency: 'USD',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.captured).toBe(false)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a DECLINED transaction to status "failed" with failureMessage', () => {
    const raw: RawHelcimTransaction = {
      transactionId: 12347,
      status: 'DECLINED',
      type: 'purchase',
      amount: 100.0,
      currency: 'USD',
      warning: 'Card declined by issuer',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureMessage).toBe('Card declined by issuer')
    expect(result.captured).toBe(true)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a pending (unknown status) transaction', () => {
    const raw: RawHelcimTransaction = {
      transactionId: 12348,
      status: 'PROCESSING',
      type: 'purchase',
      amount: 15.0,
      currency: 'CAD',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to CAD when absent', () => {
    const raw: RawHelcimTransaction = {
      transactionId: 12349,
      status: 'APPROVED',
      type: 'purchase',
      amount: 10.0,
    }
    const result = transformCharge(raw)
    expect(result.currency).toBe('CAD')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
