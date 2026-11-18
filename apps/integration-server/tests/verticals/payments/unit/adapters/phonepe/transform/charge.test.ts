import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawPhonepeOrder,
} from '../../../../../../../src/verticals/payments/adapters/phonepe/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('phonepe transformCharge', () => {
  // epoch-ms 1709251200000 = 2024-03-01T00:00:00.000Z
  const EPOCH_MS = 1709251200000

  it('maps a COMPLETED order to status "succeeded"', () => {
    const raw: RawPhonepeOrder = {
      merchantOrderId: 'MERCH-ORD-001',
      orderId: 'phonepe-ord-001',
      state: 'COMPLETED',
      amount: 4999,
      paymentDetails: [
        {
          transactionId: 'txn-001',
          paymentMode: 'UPI',
          timestamp: EPOCH_MS,
          amount: 4999,
          state: 'COMPLETED',
          rail: { type: 'UPI', utr: 'UTR001', upiTransactionId: 'upi-001', vpa: 'user@upi' },
        },
      ],
    }
    const result = transformCharge(raw)
    // id from merchantOrderId
    expect(result.id).toBe('MERCH-ORD-001')
    // externalId from orderId
    expect(result.externalId).toBe('phonepe-ord-001')
    // amount already in paise (minor units) — toMinorUnits rounds only
    expect(result.amount).toBe(4999)
    // PhonePe always returns INR
    expect(result.currency).toBe('INR')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('phonepe')
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a FAILED order to status "failed"', () => {
    const raw: RawPhonepeOrder = {
      merchantOrderId: 'MERCH-ORD-002',
      orderId: 'phonepe-ord-002',
      state: 'FAILED',
      amount: 1000,
      paymentDetails: [
        {
          transactionId: 'txn-002',
          timestamp: EPOCH_MS,
          amount: 1000,
          state: 'FAILED',
          errorCode: 'PAYMENT_ERROR',
        },
      ],
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('PAYMENT_ERROR')
    expect(result.currency).toBe('INR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps PENDING / unknown state to "pending"', () => {
    const raw: RawPhonepeOrder = {
      merchantOrderId: 'MERCH-ORD-003',
      orderId: 'phonepe-ord-003',
      state: 'PENDING',
      amount: 500,
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('INR')
    expect(result.createdAt).toBeUndefined()
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('falls back to orderId when merchantOrderId is absent', () => {
    const raw: RawPhonepeOrder = {
      orderId: 'phonepe-ord-004',
      state: 'COMPLETED',
      amount: 200,
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('phonepe-ord-004')
    expect(result.externalId).toBe('phonepe-ord-004')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('populates metadata from last payment detail', () => {
    const raw: RawPhonepeOrder = {
      merchantOrderId: 'MERCH-ORD-005',
      orderId: 'phonepe-ord-005',
      state: 'COMPLETED',
      amount: 300,
      redirectUrl: 'https://example.com/redirect',
      paymentDetails: [
        {
          transactionId: 'txn-005',
          paymentMode: 'CARD',
          timestamp: EPOCH_MS,
          amount: 300,
          state: 'COMPLETED',
        },
      ],
    }
    const result = transformCharge(raw)
    expect(result.metadata['orderId']).toBe('phonepe-ord-005')
    expect(result.metadata['merchantOrderId']).toBe('MERCH-ORD-005')
    expect(result.metadata['transactionId']).toBe('txn-005')
    expect(result.metadata['paymentMode']).toBe('CARD')
    expect(result.metadata['redirectUrl']).toBe('https://example.com/redirect')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
