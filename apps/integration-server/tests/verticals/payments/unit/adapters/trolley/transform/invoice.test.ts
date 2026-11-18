/**
 * Fixture: the invoice in the "Search invoices" example response
 * (https://developers.trolley.com/api/), with its two documented lines
 * trimmed to their ids.
 */
import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawTrolleyInvoice,
} from '../../../../../../../src/verticals/payments/adapters/trolley/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

const DOC_INVOICE: RawTrolleyInvoice = {
  id: 'I-HEG4x7Pb8VRkYZnu8Ja',
  invoiceNumber: '',
  description: 'Payment for artwork to Leonardo da Vinci',
  status: 'open',
  externalId: 'acme-inv-1002',
  invoiceDate: '2022-06-07T03:20:01.870Z',
  dueDate: null,
  createdAt: '2022-06-07T03:20:01.860Z',
  updatedAt: '2022-06-07T03:21:16.831Z',
  totalAmount: { value: '400.00', currency: 'EUR' },
  paidAmount: { value: '0.00', currency: 'EUR' },
  dueAmount: { value: '400.00', currency: 'EUR' },
  tags: [],
  lines: [{ id: 'IL-EtrPXL9aytREz2vdVgk' }, { id: 'IL-KUc9K2JsJ7Kuz5uVAH' }],
  recipientId: 'R-XgtzXghfxx4Z2E4Y3R',
}

describe('trolley transformInvoice', () => {
  it('maps the documented invoice, reading amounts from { value, currency }', () => {
    const inv = InvoiceSchema.parse(transformInvoice(DOC_INVOICE))
    expect(inv.id).toBe('I-HEG4x7Pb8VRkYZnu8Ja')
    expect(inv.externalId).toBe('I-HEG4x7Pb8VRkYZnu8Ja')
    expect(inv.number).toBeUndefined()
    expect(inv.customerId).toBe('R-XgtzXghfxx4Z2E4Y3R')
    expect(inv.status).toBe('open')
    expect(inv.currency).toBe('EUR')
    expect(inv.total).toBe(40000)
    expect(inv.amountPaid).toBe(0)
    expect(inv.amountDue).toBe(40000)
    expect(inv.dueDate).toBeUndefined()
    expect(inv.lineItemIds).toEqual(['IL-EtrPXL9aytREz2vdVgk', 'IL-KUc9K2JsJ7Kuz5uVAH'])
    expect(inv.metadata).toEqual({
      description: 'Payment for artwork to Leonardo da Vinci',
      externalId: 'acme-inv-1002',
      invoiceDate: '2022-06-07T03:20:01.870Z',
      status: 'open',
    })
  })

  it.each([
    ['open', 'open'],
    ['pending', 'open'],
    ['partially_paid', 'open'],
    ['paid', 'paid'],
    ['void', 'void'],
    ['whatever', 'unknown'],
  ])('maps documented status %s to %s', (status, want) => {
    expect(InvoiceSchema.parse(transformInvoice({ ...DOC_INVOICE, status })).status).toBe(want)
  })

  it('reads dueDate (value from the documented "Retrieve an invoice" example)', () => {
    const inv = InvoiceSchema.parse(
      transformInvoice({ ...DOC_INVOICE, dueDate: '2021-11-12T00:00:00.000Z' }),
    )
    expect(inv.dueDate).toBe('2021-11-12T00:00:00.000Z')
  })

  it('omits optional amounts that are absent', () => {
    const inv = InvoiceSchema.parse(
      transformInvoice({ ...DOC_INVOICE, paidAmount: undefined, dueAmount: null }),
    )
    expect(inv.amountPaid).toBeUndefined()
    expect(inv.amountDue).toBeUndefined()
  })

  it('throws rather than inventing a total or currency', () => {
    expect(() => transformInvoice({ ...DOC_INVOICE, totalAmount: { value: '1.00' } })).toThrow(
      /totalAmount/,
    )
    expect(() => transformInvoice({ ...DOC_INVOICE, totalAmount: undefined })).toThrow(
      /totalAmount/,
    )
    expect(() => transformInvoice({ ...DOC_INVOICE, id: '' })).toThrow(/no id/)
  })
})
