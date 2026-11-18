import { describe, it, expect } from 'vitest'
import { transformInvoice } from '../../../../../../../src/verticals/payments/adapters/payabli/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'
import { INVOICES_LIST, INVOICE_RECORD } from '../fixtures/documented'

describe('payabli transformInvoice', () => {
  it('maps the documented invoice list record', () => {
    const i = InvoiceSchema.parse(transformInvoice(INVOICES_LIST.Records[0], 'USD'))
    expect(i.id).toBe('3674')
    expect(i.number).toBe('INV-2345')
    expect(i.customerId).toBe('4440')
    expect(i.status).toBe('open')
    expect(i.currency).toBe('USD')
    expect(i.total).toBe(5000)
    expect(i.amountPaid).toBe(0)
    expect(i.dueDate).toBe('2025-03-05T00:00:00.000Z')
    expect(i.createdAt).toBe('2024-03-05T18:08:45.000Z')
  })

  it('maps the documented GET /Invoice/{idInvoice} body', () => {
    const i = InvoiceSchema.parse(transformInvoice(INVOICE_RECORD, 'CAD'))
    expect(i.id).toBe(String(INVOICE_RECORD.invoiceId))
    expect(i.currency).toBe('CAD')
  })

  it.each([
    [0, 'draft'],
    [1, 'open'],
    [2, 'open'],
    [4, 'paid'],
    [99, 'void'],
    [3, 'unknown'],
  ] as const)('maps invoiceStatus %s to %s', (invoiceStatus, status) => {
    const i = transformInvoice({ ...INVOICES_LIST.Records[0], invoiceStatus }, 'USD')
    expect(InvoiceSchema.parse(i).status).toBe(status)
  })

  it('throws rather than defaulting an amount', () => {
    expect(() =>
      transformInvoice({ ...INVOICES_LIST.Records[0], invoiceAmount: undefined }, 'USD'),
    ).toThrow(/invoiceAmount/)
  })
})
