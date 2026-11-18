import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawMidtransInvoice,
} from '../../../../../../../src/verticals/payments/adapters/midtrans/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('midtrans transformInvoice', () => {
  it('maps a paid invoice with customer and total amount', () => {
    const raw: RawMidtransInvoice = {
      id: 'inv-001',
      order_id: 'ord-001',
      invoice_number: 'INV-2024-001',
      status: 'paid',
      gross_amount: 150,
      currency: 'IDR',
      customer_details: { id: 'cust-001' },
      due_date: '2024-04-01T00:00:00Z',
      published_date: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.id).toBe('inv-001')
    expect(result.status).toBe('paid')
    // gross_amount 150 × 100 = 15000 minor units
    expect(result.total).toBe(15000)
    expect(result.customerId).toBe('cust-001')
    expect(result.gateway).toBe('midtrans')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a pending invoice to status "open"', () => {
    const raw: RawMidtransInvoice = {
      id: 'inv-002',
      status: 'pending',
      gross_amount: 50,
      currency: 'IDR',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('open')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a draft invoice to status "draft"', () => {
    const raw: RawMidtransInvoice = {
      id: 'inv-003',
      status: 'draft',
      gross_amount: 100,
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('draft')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a voided invoice to status "void"', () => {
    const raw: RawMidtransInvoice = {
      id: 'inv-004',
      status: 'voided',
      gross_amount: 0,
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('void')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
