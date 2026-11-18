import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawFaspayTransaction,
} from '../../../../../../../src/verticals/payments/adapters/faspay/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('faspay transformCharge', () => {
  it('maps payment_status_code "2" (Payment Success) to status "succeeded"', () => {
    const raw: RawFaspayTransaction = {
      trx_id: 'TRX-001',
      bill_no: 'BILL-001',
      bill_desc: 'Test Payment',
      bill_currency: 'IDR',
      bill_total: '100000',
      payment_status_code: '2',
      payment_status_desc: 'Payment Success',
      payment_channel: 'BCA Virtual Account',
      payment_date: '2024-03-01 00:00:00',
      cust_no: 'CUST-001',
      cust_name: 'John Doe',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(100000)
    expect(result.currency).toBe('IDR')
    expect(result.gateway).toBe('faspay')
    expect(result.id).toBe('TRX-001')
    expect(result.description).toBe('Test Payment')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps payment_status_code "0" (Unprocessed) to status "pending"', () => {
    const raw: RawFaspayTransaction = {
      trx_id: 'TRX-002',
      bill_currency: 'IDR',
      bill_total: '50000',
      payment_status_code: '0',
      payment_date: '2024-03-01 00:00:00',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(50000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps payment_status_code "1" (In Process) to status "pending"', () => {
    const raw: RawFaspayTransaction = {
      trx_id: 'TRX-003',
      bill_currency: 'IDR',
      bill_total: '75000',
      payment_status_code: '1',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps payment_status_code "3" (Payment Failed) to status "failed"', () => {
    const raw: RawFaspayTransaction = {
      trx_id: 'TRX-004',
      bill_currency: 'IDR',
      bill_total: '200000',
      payment_status_code: '3',
      payment_status_desc: 'Payment Failed',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('3')
    expect(result.failureMessage).toBe('Payment Failed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps payment_status_code "4" (Payment Reversal) to status "refunded"', () => {
    const raw: RawFaspayTransaction = {
      trx_id: 'TRX-005',
      bill_currency: 'IDR',
      bill_total: '100000',
      payment_status_code: '4',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps payment_status_code "8" (Payment Cancelled) to status "cancelled"', () => {
    const raw: RawFaspayTransaction = {
      trx_id: 'TRX-006',
      bill_currency: 'IDR',
      bill_total: '100000',
      payment_status_code: '8',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
