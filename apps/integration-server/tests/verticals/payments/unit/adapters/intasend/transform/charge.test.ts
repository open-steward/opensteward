import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawIntasendPaymentStatus,
  type RawIntasendInvoice,
} from '../../../../../../../src/verticals/payments/adapters/intasend/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('intasend transformCharge', () => {
  it('maps a COMPLETE invoice via payment status shape to "succeeded"', () => {
    const raw: RawIntasendPaymentStatus = {
      invoice: {
        invoice_id: 'INV-001',
        state: 'COMPLETE',
        value: '49.99',
        currency: 'KES',
        created_at: '2024-03-01T00:00:00Z',
        updated_at: '2024-03-01T00:00:00Z',
      },
      meta: {
        customer: {
          id: 'cust-123',
          email: 'buyer@example.com',
        },
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('KES')
    expect(result.customerId).toBe('cust-123')
    expect(result.receiptEmail).toBe('buyer@example.com')
    expect(result.gateway).toBe('intasend')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a FAILED invoice to status "failed" with failure details', () => {
    const raw: RawIntasendPaymentStatus = {
      invoice: {
        invoice_id: 'INV-002',
        state: 'FAILED',
        value: '20.00',
        currency: 'KES',
        failed_code: 'CARD_DECLINED',
        failed_reason: 'Insufficient funds',
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('CARD_DECLINED')
    expect(result.failureMessage).toBe('Insufficient funds')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a PENDING invoice to status "pending"', () => {
    const raw: RawIntasendPaymentStatus = {
      invoice: {
        invoice_id: 'INV-003',
        state: 'PENDING',
        value: '15.00',
        currency: 'KES',
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.captured).toBeUndefined()
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('handles bare invoice shape (webhook)', () => {
    const raw: RawIntasendInvoice = {
      invoice_id: 'INV-004',
      state: 'COMPLETED',
      value: '100.00',
      currency: 'USD',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.captured).toBe(true)
    expect(result.id).toBe('INV-004')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('uses account as receiptEmail when it looks like an email', () => {
    const raw: RawIntasendInvoice = {
      invoice_id: 'INV-005',
      state: 'COMPLETE',
      value: '10.00',
      currency: 'KES',
      account: 'payer@test.com',
    }
    const result = transformCharge(raw)
    expect(result.receiptEmail).toBe('payer@test.com')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
