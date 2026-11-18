import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawJuspayOrder,
} from '../../../../../../../src/verticals/payments/adapters/juspay/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('juspay transformCharge', () => {
  it('maps status CHARGED to "succeeded" and converts amount', () => {
    const raw: RawJuspayOrder = {
      order_id: 'order-001',
      id: 'order-001',
      status: 'CHARGED',
      amount: 499.99,
      currency: 'INR',
      customer_id: 'cust-001',
      customer_email: 'user@example.com',
      date_created: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(49999)
    expect(result.currency).toBe('INR')
    expect(result.customerId).toBe('cust-001')
    expect(result.receiptEmail).toBe('user@example.com')
    expect(result.gateway).toBe('juspay')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status FAILED to "failed" and captures error fields', () => {
    const raw: RawJuspayOrder = {
      order_id: 'order-002',
      status: 'FAILED',
      amount: 100,
      currency: 'INR',
      bank_error_code: 'BANK_ERR_001',
      bank_error_message: 'Insufficient funds',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('BANK_ERR_001')
    expect(result.failureMessage).toBe('Insufficient funds')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status PENDING to "pending"', () => {
    const raw: RawJuspayOrder = {
      order_id: 'order-003',
      status: 'PENDING',
      amount: 50,
      currency: 'INR',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps refunded=true to "refunded" regardless of status', () => {
    const raw: RawJuspayOrder = {
      order_id: 'order-004',
      status: 'CHARGED',
      amount: 200,
      currency: 'INR',
      refunded: true,
      amount_refunded: 200,
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps partial refund to "partially_refunded"', () => {
    const raw: RawJuspayOrder = {
      order_id: 'order-005',
      status: 'CHARGED',
      amount: 200,
      currency: 'INR',
      refunded: false,
      amount_refunded: 100,
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('partially_refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps VOIDED status to "cancelled"', () => {
    const raw: RawJuspayOrder = {
      order_id: 'order-006',
      status: 'VOIDED',
      amount: 75,
      currency: 'INR',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
