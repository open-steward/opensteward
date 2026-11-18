import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawSquarePayment,
} from '../../../../../../../src/verticals/payments/adapters/square/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('square transformCharge', () => {
  it('maps a COMPLETED payment to status "succeeded"', () => {
    const raw: RawSquarePayment = {
      id: 'PAY-001',
      status: 'COMPLETED',
      amount_money: { amount: 3000, currency: 'USD' },
      customer_id: 'CUST-001',
      buyer_email_address: 'buyer@example.com',
      receipt_url: 'https://squareup.com/receipt/1',
      note: 'Order #101',
      created_at: '2024-06-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(3000)
    expect(result.currency).toBe('USD')
    expect(result.customerId).toBe('CUST-001')
    expect(result.receiptEmail).toBe('buyer@example.com')
    expect(result.gateway).toBe('square')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('derives status "partially_refunded" when partial refund applied', () => {
    const raw: RawSquarePayment = {
      id: 'PAY-002',
      status: 'COMPLETED',
      amount_money: { amount: 5000, currency: 'USD' },
      refunded_money: { amount: 2000, currency: 'USD' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('partially_refunded')
    expect(result.amountRefunded).toBe(2000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('derives status "refunded" when fully refunded', () => {
    const raw: RawSquarePayment = {
      id: 'PAY-003',
      status: 'COMPLETED',
      amount_money: { amount: 1000, currency: 'EUR' },
      refunded_money: { amount: 1000, currency: 'EUR' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELED payment to status "cancelled"', () => {
    const raw: RawSquarePayment = {
      id: 'PAY-004',
      status: 'CANCELED',
      amount_money: { amount: 500, currency: 'GBP' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
