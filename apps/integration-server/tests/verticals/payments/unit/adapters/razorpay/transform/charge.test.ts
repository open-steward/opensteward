import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawRazorpayPayment,
} from '../../../../../../../src/verticals/payments/adapters/razorpay/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('razorpay transformCharge', () => {
  it('maps a captured payment to succeeded status with upper-cased currency', () => {
    const raw: RawRazorpayPayment = {
      id: 'pay_1',
      amount: 5000,
      amount_refunded: 0,
      currency: 'inr',
      status: 'captured',
      customer_id: 'cust_abc',
      invoice_id: 'inv_xyz',
      method: 'card',
      description: 'Test order',
      email: 'test@example.com',
      error_code: undefined,
      error_description: undefined,
      notes: { orderId: '99' },
      created_at: 1_700_000_000,
    }
    const result = transformCharge(raw)

    expect(result.id).toBe('pay_1')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('INR')
    expect(result.status).toBe('succeeded')
    expect(result.customerId).toBe('cust_abc')
    expect(result.invoiceId).toBe('inv_xyz')
    expect(result.gateway).toBe('razorpay')
    expect(result.metadata.orderId).toBe('99')
    expect(result.createdAt).toMatch(/^2023-/)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('computes partially_refunded status when amount_refunded > 0 but < amount', () => {
    const raw: RawRazorpayPayment = {
      id: 'pay_2',
      amount: 10000,
      amount_refunded: 3000,
      currency: 'INR',
      status: 'captured',
      created_at: 1_700_000_000,
    }
    const result = transformCharge(raw)

    expect(result.status).toBe('partially_refunded')
    expect(result.amountRefunded).toBe(3000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a failed payment with error fields', () => {
    const raw: RawRazorpayPayment = {
      id: 'pay_3',
      amount: 2000,
      currency: 'INR',
      status: 'failed',
      error_code: 'BAD_REQUEST_ERROR',
      error_description: 'Card declined',
      created_at: 1_700_000_000,
    }
    const result = transformCharge(raw)

    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('BAD_REQUEST_ERROR')
    expect(result.failureMessage).toBe('Card declined')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
