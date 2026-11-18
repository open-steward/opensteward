import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawMidtransTransaction,
} from '../../../../../../../src/verticals/payments/adapters/midtrans/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('midtrans transformCharge', () => {
  it('maps a settlement transaction to status "succeeded"', () => {
    const raw: RawMidtransTransaction = {
      order_id: 'order-001',
      transaction_id: 'txn-001',
      transaction_status: 'settlement',
      gross_amount: '12000.00',
      currency: 'IDR',
      transaction_time: '2024-03-01 10:00:00',
      settlement_time: '2024-03-01 11:00:00',
      payment_type: 'credit_card',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('order-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(1200000)
    expect(result.currency).toBe('IDR')
    expect(result.gateway).toBe('midtrans')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a cancelled transaction to status "cancelled"', () => {
    const raw: RawMidtransTransaction = {
      order_id: 'order-002',
      transaction_status: 'cancel',
      gross_amount: '5000.00',
      currency: 'IDR',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a denied fraud_status to status "failed"', () => {
    const raw: RawMidtransTransaction = {
      order_id: 'order-003',
      transaction_status: 'capture',
      fraud_status: 'deny',
      gross_amount: '8000.00',
      currency: 'IDR',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a refunded transaction to status "refunded"', () => {
    const raw: RawMidtransTransaction = {
      order_id: 'order-004',
      transaction_status: 'refund',
      gross_amount: '3000.00',
      currency: 'IDR',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
