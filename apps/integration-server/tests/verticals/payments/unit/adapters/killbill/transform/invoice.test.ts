import { describe, it, expect } from 'vitest'
import { transformInvoice } from '../../../../../../../src/verticals/payments/adapters/killbill/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

// Top-level fields of the "Retrieve an invoice by id" Example Response
// (https://killbill.github.io/slate/invoice.html), verbatim; its `items`
// array (one TAX item) is elided because the transform does not read it.
const DOC_INVOICE = {
  amount: 50,
  currency: 'USD',
  status: 'COMMITTED',
  creditAdj: 0,
  refundAdj: 0,
  invoiceId: '4bc38bfd-3210-4293-bcfc-7c95b2d1472a',
  invoiceDate: '2023-09-18',
  targetDate: '2023-09-18',
  invoiceNumber: '6894',
  balance: 50,
  accountId: 'd7ec4174-ab07-4e25-a917-ad020b755917',
  bundleKeys: null,
  credits: null,
  items: [],
}

describe('killbill transformInvoice', () => {
  it('maps a committed invoice with a balance to open', () => {
    const i = InvoiceSchema.parse(transformInvoice(DOC_INVOICE))
    expect(i.id).toBe('4bc38bfd-3210-4293-bcfc-7c95b2d1472a')
    expect(i.number).toBe('6894')
    expect(i.customerId).toBe('d7ec4174-ab07-4e25-a917-ad020b755917')
    expect(i.total).toBe(5000)
    expect(i.amountDue).toBe(5000)
    expect(i.status).toBe('open')
    expect(i.createdAt).toBe('2023-09-18T00:00:00.000Z')
  })

  it('maps COMMITTED with no balance to paid, DRAFT and VOID as documented', () => {
    expect(transformInvoice({ ...DOC_INVOICE, balance: 0 }).status).toBe('paid')
    expect(transformInvoice({ ...DOC_INVOICE, status: 'DRAFT' }).status).toBe('draft')
    expect(transformInvoice({ ...DOC_INVOICE, status: 'VOID' }).status).toBe('void')
  })

  it('throws instead of inventing a total or currency', () => {
    expect(() => transformInvoice({ ...DOC_INVOICE, amount: null })).toThrow(/amount/)
    expect(() => transformInvoice({ ...DOC_INVOICE, currency: null })).toThrow(/currency/)
  })
})
