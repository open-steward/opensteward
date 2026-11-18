import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawBilldeskTransaction,
} from '../../../../../../../src/verticals/payments/adapters/billdesk/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('billdesk transformCharge', () => {
  it('maps auth_status 0300 to status "succeeded"', () => {
    const raw: RawBilldeskTransaction = {
      transactionid: 'txn-001',
      bdorderid: 'bdo-001',
      orderid: 'ord-001',
      mercid: 'MERC001',
      amount: '299.00',
      currency: '356',
      auth_status: '0300',
      transaction_date: '2024-03-01T00:00:00+05:30',
      bank_ref_no: 'BANKREF001',
      payment_method_type: 'UPI',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('txn-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(29900)
    expect(result.currency).toBe('INR')
    expect(result.captured).toBe(true)
    expect(result.gateway).toBe('billdesk')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps auth_status 0399 to status "failed"', () => {
    const raw: RawBilldeskTransaction = {
      transactionid: 'txn-002',
      amount: '100.00',
      currency: '356',
      auth_status: '0399',
      transaction_error_code: 'ERR01',
      transaction_error_desc: 'Insufficient funds',
      transaction_error_type: 'failure',
      transaction_date: '2024-03-01T00:00:00+05:30',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.captured).toBe(false)
    expect(result.failureCode).toBe('ERR01')
    expect(result.failureMessage).toBe('Insufficient funds')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps auth_status 0002 to status "pending"', () => {
    const raw: RawBilldeskTransaction = {
      transactionid: 'txn-003',
      amount: '500.00',
      currency: '356',
      auth_status: '0002',
      transaction_date: '2024-03-01T00:00:00+05:30',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.captured).toBe(false)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an ACTIVE order (no auth_status) to status "pending"', () => {
    const raw: RawBilldeskTransaction = {
      bdorderid: 'bdo-004',
      orderid: 'ord-004',
      amount: '150.00',
      currency: '356',
      status: 'ACTIVE',
      order_date: '2024-03-01T00:00:00+05:30',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('bdo-004')
    expect(result.status).toBe('pending')
    expect(result.invoiceId).toBe('ord-004')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an EXPIRED order to status "cancelled"', () => {
    const raw: RawBilldeskTransaction = {
      bdorderid: 'bdo-005',
      amount: '75.00',
      currency: '356',
      status: 'EXPIRED',
      order_date: '2024-03-01T00:00:00+05:30',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('converts numeric currency code 356 to "INR"', () => {
    const raw: RawBilldeskTransaction = {
      transactionid: 'txn-006',
      amount: '1000.00',
      currency: '356',
      auth_status: '0300',
    }
    const result = transformCharge(raw)
    expect(result.currency).toBe('INR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
