import { describe, it, expect } from 'vitest'
import {
  transformPayableAsInvoice,
  transformSearchPayableAsInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/spendesk/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { payable, searchPayable } from '../fixtures'

describe('transformSearchPayableAsInvoice (spendesk, POST /v1/payables/search)', () => {
  const raw = () =>
    searchPayable({
      dueDate: '2024-07-15T00:00:00.000Z',
      outstandingAmount: 1500,
      documentaryEvidence: {
        type: 'invoice',
        validity: { valid: true },
        invoiceNumber: 'SUPP-INV-100',
      },
    })

  it('maps the documented example to a BILL', () => {
    expect(InvoiceSchema.parse(transformSearchPayableAsInvoice(raw()))).toMatchObject({
      id: 'bc9cef35-401d-4ea4-b384-ed725e6685cf',
      type: 'BILL',
      invoiceNumber: 'SUPP-INV-100',
      contactId: 'sup_xyz',
      currency: 'EUR',
      totalAmount: 1500,
      balanceAmount: 1500,
      postedAt: new Date('2024-06-15T10:30:00.000Z'),
      dueAt: new Date('2024-07-15T00:00:00.000Z'),
      createdAt: new Date('2024-06-15T10:30:00.000Z'),
      lineItems: [{ taxAmount: 250, totalAmount: 1500 }],
    })
  })

  // creationDate is the issue date and "does NOT reflect when the record entered
  // Spendesk (see firstCreatedAt for that)": the two must not be swapped.
  it('postedAt is creationDate and createdAt is firstCreatedAt', () => {
    const r = InvoiceSchema.parse(
      transformSearchPayableAsInvoice({
        ...raw(),
        ...{ creationDate: '2024-05-01T00:00:00.000Z', firstCreatedAt: '2024-06-15T10:30:00.000Z' },
      }),
    )
    expect(r.postedAt).toEqual(new Date('2024-05-01T00:00:00.000Z'))
    expect(r.createdAt).toEqual(new Date('2024-06-15T10:30:00.000Z'))
  })

  it('takes invoiceNumber only from invoice evidence, not a declaration of a missing one', () => {
    const r = searchPayable({
      documentaryEvidence: {
        type: 'declarationOfMissingInvoice',
        validity: { valid: true },
        invoiceNumber: 'X',
      },
    })
    expect(InvoiceSchema.parse(transformSearchPayableAsInvoice(r)).invoiceNumber).toBeUndefined()
  })

  it('maps no status (bookkeeping state is not payment state)', () => {
    const r = searchPayable({ state: 'exported' })
    expect(InvoiceSchema.parse(transformSearchPayableAsInvoice(r)).status).toBeUndefined()
  })
})

describe('transformPayableAsInvoice (spendesk, GET /v1/payables/{id})', () => {
  it('maps the documented fields', () => {
    expect(InvoiceSchema.parse(transformPayableAsInvoice(payable()))).toMatchObject({
      id: 'bc9cef35-401d-4ea4-b384-ed725e6685cf',
      type: 'BILL',
      invoiceNumber: 'SUPP-INV-100',
      contactId: 'sup_xyz',
      currency: 'EUR',
      totalAmount: 1500,
      balanceAmount: 1500,
      postedAt: new Date('2024-06-15T00:00:00.000Z'),
      dueAt: new Date('2024-07-15T00:00:00.000Z'),
      createdAt: new Date('2024-06-15T10:30:00.000Z'),
    })
  })

  it('maps no status from bookkeepingStatus', () => {
    const inv = InvoiceSchema.parse(
      transformPayableAsInvoice(payable({ bookkeepingStatus: 'exported' })),
    )
    expect(inv.status).toBeUndefined()
    expect(inv.taxAmount).toBeUndefined()
  })
})
