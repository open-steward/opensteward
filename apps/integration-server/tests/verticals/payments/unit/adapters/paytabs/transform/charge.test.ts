import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawPaytabsTransaction,
} from '../../../../../../../src/verticals/payments/adapters/paytabs/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('paytabs transformCharge', () => {
  it('maps an authorised sale to status "succeeded" with minor-unit amount', () => {
    const raw: RawPaytabsTransaction = {
      tran_ref: 'TST2024000001',
      tran_type: 'sale',
      tran_class: 'ecom',
      cart_id: 'cart-001',
      cart_description: 'Order #1',
      cart_currency: 'AED',
      cart_amount: '500.00',
      customer_details: {
        name: 'Ali Hassan',
        email: 'ali@example.com',
        phone: '+971501234567',
        country: 'AE',
      },
      payment_result: {
        response_status: 'A',
        response_code: '100',
        response_message: 'Authorised',
        transaction_time: '2024-03-01T00:00:00Z',
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe('AED')
    expect(result.receiptEmail).toBe('ali@example.com')
    expect(result.captured).toBe(true)
    expect(result.gateway).toBe('paytabs')
    expect(result.id).toBe('TST2024000001')
    expect(result.externalId).toBe('TST2024000001')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a declined transaction to status "failed" with failure fields', () => {
    const raw: RawPaytabsTransaction = {
      tran_ref: 'TST2024000002',
      tran_type: 'sale',
      cart_currency: 'SAR',
      cart_amount: '100.00',
      payment_result: {
        response_status: 'D',
        response_code: '107',
        response_message: 'Do not honour',
        transaction_time: '2024-03-01T00:00:00Z',
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('107')
    expect(result.failureMessage).toBe('Do not honour')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a pending hold transaction to status "pending"', () => {
    const raw: RawPaytabsTransaction = {
      tran_ref: 'TST2024000003',
      tran_type: 'sale',
      cart_currency: 'USD',
      cart_amount: '250.50',
      payment_result: {
        response_status: 'H',
        transaction_time: '2024-03-01T00:00:00Z',
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(25050)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a voided transaction to status "cancelled"', () => {
    const raw: RawPaytabsTransaction = {
      tran_ref: 'TST2024000004',
      tran_type: 'void',
      cart_currency: 'AED',
      cart_amount: '75.00',
      payment_result: {
        response_status: 'V',
        transaction_time: '2024-03-01T00:00:00Z',
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps auth tran_type with A status to "pending" (not yet captured)', () => {
    const raw: RawPaytabsTransaction = {
      tran_ref: 'TST2024000005',
      tran_type: 'auth',
      cart_currency: 'AED',
      cart_amount: '200.00',
      payment_result: {
        response_status: 'A',
        transaction_time: '2024-03-01T00:00:00Z',
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.captured).toBe(false)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
