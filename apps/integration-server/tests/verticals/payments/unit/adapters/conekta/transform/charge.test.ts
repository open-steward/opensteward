import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawConektaOrder,
} from '../../../../../../../src/verticals/payments/adapters/conekta/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('conekta transformCharge', () => {
  it('maps a paid order to status "succeeded" with correct amount and currency', () => {
    const raw: RawConektaOrder = {
      id: 'ord-001',
      amount: 4999,
      currency: 'MXN',
      payment_status: 'paid',
      customer_info: {
        customer_id: 'cust-abc',
        email: 'buyer@example.com',
      },
      charges: {
        data: [{ id: 'ch-001' }],
      },
      created_at: 1709251200,
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('MXN')
    expect(result.customerId).toBe('cust-abc')
    expect(result.receiptEmail).toBe('buyer@example.com')
    expect(result.paymentMethodId).toBe('ch-001')
    expect(result.gateway).toBe('conekta')
    expect(result.captured).toBe(true)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a declined order to status "failed"', () => {
    const raw: RawConektaOrder = {
      id: 'ord-002',
      amount: 1000,
      currency: 'MXN',
      payment_status: 'declined',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.gateway).toBe('conekta')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a partially_refunded order correctly', () => {
    const raw: RawConektaOrder = {
      id: 'ord-003',
      amount: 5000,
      amount_refunded: 1500,
      currency: 'MXN',
      payment_status: 'partially_refunded',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('partially_refunded')
    expect(result.amountRefunded).toBe(1500)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a voided order to status "cancelled"', () => {
    const raw: RawConektaOrder = {
      id: 'ord-004',
      amount: 2000,
      currency: 'MXN',
      payment_status: 'voided',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
