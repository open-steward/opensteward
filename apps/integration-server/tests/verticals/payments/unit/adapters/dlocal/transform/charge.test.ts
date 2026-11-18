import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawDLocalPayment,
} from '../../../../../../../src/verticals/payments/adapters/dlocal/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('dlocal transformCharge', () => {
  it('maps a PAID payment to status "succeeded" with correct amount', () => {
    const raw: RawDLocalPayment = {
      id: 'pay-001',
      status: 'PAID',
      amount: 49.99,
      currency: 'USD',
      payer: { email: 'buyer@example.com', name: 'John Doe' },
      description: 'Order #42',
      order_id: 'ord-001',
      payment_method_id: 'CARD',
      payment_method_type: 'CARD',
      country: 'MX',
      created_date: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('pay-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.receiptEmail).toBe('buyer@example.com')
    expect(result.description).toBe('Order #42')
    expect(result.gateway).toBe('dlocal')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a REJECTED payment to status "failed" with failureCode', () => {
    const raw: RawDLocalPayment = {
      id: 'pay-002',
      status: 'REJECTED',
      status_detail: 'INSUFFICIENT_FUNDS',
      amount: 100,
      currency: 'BRL',
      created_date: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('INSUFFICIENT_FUNDS')
    expect(result.currency).toBe('BRL')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELLED payment to status "cancelled"', () => {
    const raw: RawDLocalPayment = {
      id: 'pay-003',
      status: 'CANCELLED',
      amount: 50,
      currency: 'USD',
      created_date: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a PARTIALLY_REFUNDED payment correctly', () => {
    const raw: RawDLocalPayment = {
      id: 'pay-004',
      status: 'PARTIALLY_REFUNDED',
      amount: 200,
      currency: 'USD',
      created_date: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('partially_refunded')
    expect(result.amount).toBe(20000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
