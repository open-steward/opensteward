import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawBillieOrder,
} from '../../../../../../../src/verticals/payments/adapters/billie/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('billie transformCharge', () => {
  it('maps a "complete" order to status "succeeded" with correct amount', () => {
    const raw: RawBillieOrder = {
      uuid: 'order-abc-123',
      external_code: 'EXT-001',
      state: 'complete',
      amount: { gross: 260.27, net: 218.71, tax: 41.56 },
      created_at: '2024-03-01T00:00:00Z',
      debtor: {
        name: 'Acme GmbH',
        external_data: { merchant_customer_id: 'customer-42' },
      },
      selected_payment_method: 'invoice',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('order-abc-123')
    expect(result.status).toBe('succeeded')
    // 260.27 EUR → 26027 cents
    expect(result.amount).toBe(26027)
    expect(result.currency).toBe('EUR')
    expect(result.customerId).toBe('customer-42')
    expect(result.gateway).toBe('billie')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a "declined" order to status "failed" with failureCode', () => {
    const raw: RawBillieOrder = {
      uuid: 'order-def-456',
      state: 'declined',
      decline_reason: 'insufficient_credit',
      amount: { gross: 100.0, net: 84.03, tax: 15.97 },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('insufficient_credit')
    expect(result.failureMessage).toBe('insufficient_credit')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a "cancelled" order to status "cancelled"', () => {
    const raw: RawBillieOrder = {
      uuid: 'order-ghi-789',
      state: 'cancelled',
      amount: { gross: 50.0, net: 42.02, tax: 7.98 },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a "shipped" order to status "succeeded" and attaches invoiceId', () => {
    const raw: RawBillieOrder = {
      uuid: 'order-jkl-000',
      state: 'shipped',
      amount: { gross: 75.5, net: 63.45, tax: 12.05 },
      invoices: [{ uuid: 'invoice-cap-001', invoice_number: 'INV-001', state: 'new' }],
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.invoiceId).toBe('invoice-cap-001')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an "authorized" order to status "pending"', () => {
    const raw: RawBillieOrder = {
      uuid: 'order-mno-111',
      state: 'authorized',
      amount: { gross: 200.0, net: 168.07, tax: 31.93 },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
