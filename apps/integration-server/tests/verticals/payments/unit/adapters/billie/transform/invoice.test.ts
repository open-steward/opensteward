import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawBillieInvoice,
} from '../../../../../../../src/verticals/payments/adapters/billie/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('billie transformInvoice', () => {
  it('maps a "paid_out" invoice to status "paid" with correct amounts', () => {
    const raw: RawBillieInvoice = {
      uuid: 'invoice-abc-001',
      invoice_number: 'INV-2024-001',
      state: 'paid_out',
      amount: { gross: 260.27, net: 218.71, tax: 41.56 },
      outstanding_amount: { gross: 0.0, net: 0.0, tax: 0.0 },
      payout_amount: { gross: 250.0, net: 210.08, tax: 39.92 },
      fee_amount: { gross: 10.27, net: 8.63, tax: 1.64 },
      fee_rate: 0.04,
      duration: 30,
      due_date: '2024-03-31T00:00:00Z',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.id).toBe('invoice-abc-001')
    expect(result.status).toBe('paid')
    // gross 260.27 → 26027 cents
    expect(result.total).toBe(26027)
    expect(result.currency).toBe('EUR')
    expect(result.number).toBe('INV-2024-001')
    expect(result.gateway).toBe('billie')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a "cancelled" invoice to status "void"', () => {
    const raw: RawBillieInvoice = {
      uuid: 'invoice-def-002',
      state: 'cancelled',
      amount: { gross: 100.0, net: 84.03, tax: 15.97 },
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('void')
    expect(result.total).toBe(10000)
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a "new" invoice to status "open" and computes amountPaid', () => {
    const raw: RawBillieInvoice = {
      uuid: 'invoice-ghi-003',
      state: 'new',
      amount: { gross: 150.0, net: 126.05, tax: 23.95 },
      outstanding_amount: { gross: 150.0, net: 126.05, tax: 23.95 },
      due_date: '2024-04-01T00:00:00Z',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('open')
    expect(result.amountDue).toBe(15000)
    // total - outstanding = 15000 - 15000 = 0
    expect(result.amountPaid).toBe(0)
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a "complete" invoice to status "paid" with subtotal and tax', () => {
    const raw: RawBillieInvoice = {
      uuid: 'invoice-jkl-004',
      state: 'complete',
      amount: { gross: 119.0, net: 100.0, tax: 19.0 },
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('paid')
    // net 100.0 → 10000 cents
    expect(result.subtotal).toBe(10000)
    // tax 19.0 → 1900 cents
    expect(result.tax).toBe(1900)
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
