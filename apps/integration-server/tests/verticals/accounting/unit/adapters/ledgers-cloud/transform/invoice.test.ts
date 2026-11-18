import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/ledgers-cloud/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

const base = {
  id: 'inv-20',
  invoice_number: 'INV-2024-020',
  invoice_date: '2024-06-01T00:00:00.000Z',
  validity_date: '2030-07-01T00:00:00.000Z',
  contact: { id: 'cont-6' },
  billings_currency: 'EUR',
  payment_status: 'Not Paid',
  total_amount: 50000,
  paid_amount: 0,
  balance_amount: 50000,
  tax_amount: 5000,
  discount_amount: 1000,
  notes: 'Consulting services',
  created_at: '2024-06-01T00:00:00.000Z',
  updated_at: '2024-06-02T00:00:00.000Z',
  items: [
    {
      id: 'li-5',
      description: 'Strategy consulting',
      unit_price: 50000,
      quantity: 1,
      amount: 50000,
      tax_amount: 5000,
    },
  ],
}

describe('transformInvoice', () => {
  it('maps core fields', () => {
    const result = transformInvoice(base)
    expect(result.id).toBe('inv-20')
    expect(result.type).toBe('INVOICE')
    expect(result.invoiceNumber).toBe('INV-2024-020')
    expect(result.contactId).toBe('cont-6')
    expect(result.currency).toBe('EUR')
    expect(result.totalAmount).toBe(50000)
    expect(result.taxAmount).toBe(5000)
    expect(result.discountAmount).toBe(1000)
  })

  it('maps payment_status Paid to PAID', () => {
    expect(transformInvoice({ ...base, payment_status: 'Paid' }).status).toBe('PAID')
  })

  it('maps payment_status Part Paid to PARTIALLY_PAID', () => {
    expect(transformInvoice({ ...base, payment_status: 'Part Paid' }).status).toBe('PARTIALLY_PAID')
  })

  it('maps payment_status Not Paid to AUTHORIZED', () => {
    expect(transformInvoice({ ...base, payment_status: 'Not Paid' }).status).toBe('AUTHORIZED')
  })

  it('prefers billings_currency over currency', () => {
    const result = transformInvoice({ ...base, currency: 'USD' })
    expect(result.currency).toBe('EUR')
  })

  it('parses invoice_date as postedAt', () => {
    expect(transformInvoice(base).postedAt).toEqual(new Date('2024-06-01T00:00:00.000Z'))
  })

  it('parses validity_date as dueAt', () => {
    expect(transformInvoice(base).dueAt).toEqual(new Date('2030-07-01T00:00:00.000Z'))
  })

  it('maps items to lineItems', () => {
    const result = transformInvoice(base)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemDescription).toBe('Strategy consulting')
    expect(result.lineItems![0].totalAmount).toBe(50000)
  })

  it('passes schema validation', () => {
    expect(() => InvoiceSchema.parse(transformInvoice(base))).not.toThrow()
  })

  it('round-trips through untransformInvoice', () => {
    const canonical = transformInvoice(base)
    const wire = untransformInvoice(canonical)
    expect(wire.invoice_number).toBe('INV-2024-020')
    expect(wire.billings_currency).toBe('EUR')
  })
})
