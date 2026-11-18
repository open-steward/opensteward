import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawCashfreeCharge,
} from '../../../../../../../src/verticals/payments/adapters/cashfree/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('cashfree transformCharge', () => {
  it('maps a successful payment attempt to status "succeeded"', () => {
    const raw: RawCashfreeCharge = {
      cf_payment_id: 'cfpay-001',
      order_id: 'ord-001',
      payment_amount: 499,
      payment_currency: 'INR',
      payment_status: 'SUCCESS',
      payment_time: '2024-03-01T00:00:00Z',
      payment_completion_time: '2024-03-01T00:00:00Z',
      customer_details: {
        customer_id: 'cust-001',
        customer_email: 'buyer@example.com',
      },
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('cfpay-001')
    expect(result.amount).toBe(49900)
    expect(result.currency).toBe('INR')
    expect(result.status).toBe('succeeded')
    expect(result.customerId).toBe('cust-001')
    expect(result.gateway).toBe('cashfree')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a PAID order (no payment fields) to "succeeded"', () => {
    const raw: RawCashfreeCharge = {
      cf_order_id: 456,
      order_id: 'ord-002',
      order_amount: 100,
      order_currency: 'INR',
      order_status: 'PAID',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(10000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a FAILED payment', () => {
    const raw: RawCashfreeCharge = {
      cf_payment_id: 'cfpay-002',
      order_id: 'ord-003',
      payment_amount: 50,
      payment_currency: 'INR',
      payment_status: 'FAILED',
      error_details: { error_code: 'CARD_DECLINED', error_description: 'Insufficient funds' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('CARD_DECLINED')
    expect(result.failureMessage).toBe('Insufficient funds')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a PENDING payment', () => {
    const raw: RawCashfreeCharge = {
      cf_payment_id: 'cfpay-003',
      order_id: 'ord-004',
      payment_amount: 200,
      payment_currency: 'USD',
      payment_status: 'PENDING',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('USD')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
