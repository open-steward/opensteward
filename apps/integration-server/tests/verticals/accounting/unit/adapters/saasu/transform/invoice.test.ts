/** Saasu sale tax invoice → Invoice, over the documented samples (see ../fixtures.ts). */
import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  isSaleInvoice,
  transformInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/saasu/transform/invoice'
import { invoiceDetail, invoiceSummary } from '../fixtures'

describe('transformInvoice (saasu)', () => {
  it('maps the documented summary fields, amounts in minor units', () => {
    const inv = InvoiceSchema.parse(transformInvoice(invoiceSummary()))
    expect(inv).toMatchObject({
      id: '5093684',
      type: 'INVOICE',
      status: 'AUTHORIZED',
      invoiceNumber: 'INV-1123',
      contactId: '1568986',
      currency: 'AUD',
      totalAmount: 1045,
      paidAmount: 0,
      balanceAmount: 1150,
      reference: 'PO-4456',
      lineAmountsIncludeTax: true,
      postedAt: '2015-01-24',
    })
    expect(inv.taxAmount).toBeUndefined()
    expect(inv.createdAt).toEqual(new Date('2026-09-27T19:00:10.305Z'))
    expect(inv.updatedAt).toEqual(new Date('2026-09-28T19:00:10.305Z'))
  })

  it('leaves lineItems unset on a list row, which carries none', () => {
    expect(InvoiceSchema.parse(transformInvoice(invoiceSummary())).lineItems).toBeUndefined()
  })

  it('maps detail line items in minor units', () => {
    const inv = InvoiceSchema.parse(transformInvoice(invoiceDetail({ NotesExternal: 'Thanks' })))
    expect(inv.notes).toBe('Thanks')
    expect(inv.lineItems).toEqual([
      {
        id: '30',
        itemId: '30',
        itemSku: 'CC123',
        itemDescription: 'Sale Item',
        unitAmount: 1150,
        unitQuantity: 3,
        totalAmount: 1045,
      },
    ])
  })

  it('scales by the currency exponent (JPY has none)', () => {
    const inv = InvoiceSchema.parse(
      transformInvoice(invoiceSummary({ Currency: 'JPY', TotalAmount: 1000, AmountOwed: 1000 })),
    )
    expect(inv.totalAmount).toBe(1000)
  })

  it('maps PaymentStatus P to PAID and a part-paid U to PARTIALLY_PAID', () => {
    expect(transformInvoice(invoiceSummary({ PaymentStatus: 'P' })).status).toBe('PAID')
    expect(transformInvoice(invoiceSummary({ PaymentStatus: 'U', AmountPaid: 2 })).status).toBe(
      'PARTIALLY_PAID',
    )
    expect(
      InvoiceSchema.parse(transformInvoice(invoiceSummary({ PaymentStatus: 'X' }))).status,
    ).toBe('unknown')
  })

  it('drops a fractional quantity rather than rounding it', () => {
    const inv = transformInvoice(
      invoiceDetail({ LineItems: [{ Id: 1, Quantity: 1.5, UnitPrice: 2, TotalAmount: 3 }] }),
    )
    expect(InvoiceSchema.parse(inv).lineItems![0]!.unitQuantity).toBeUndefined()
  })

  it('recognises only sale tax invoices', () => {
    expect(isSaleInvoice(invoiceSummary())).toBe(true)
    expect(isSaleInvoice(invoiceSummary({ TransactionType: 'P' }))).toBe(false)
    expect(isSaleInvoice(invoiceSummary({ InvoiceType: 'Adjustment Note' }))).toBe(false)
    expect(isSaleInvoice(invoiceSummary({ InvoiceType: 'Sale Order' }))).toBe(false)
  })
})
