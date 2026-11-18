import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type SimplbooksInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/simplbooks/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeRaw(overrides: Partial<SimplbooksInvoice> = {}): SimplbooksInvoice {
  return {
    id: 101,
    number: 'INV-101',
    client_id: 5,
    currency: 'EUR',
    total: 11900,
    total_vat: 1900,
    total_without_vat: 10000,
    paid: 0,
    balance: 11900,
    status: 'sent',
    invoice_date: '2024-04-01',
    due_date: '2024-05-01',
    paid_date: null,
    reference: 'PO-555',
    notes: 'Monthly retainer',
    rows: [
      {
        id: 1,
        product_id: 10,
        description: 'Consulting',
        quantity: 10,
        unit_price: 1000,
        total: 11900,
        vat_amount: 1900,
        account_code: '3000',
      },
    ],
    ...overrides,
  }
}

describe('transformInvoice (simplbooks)', () => {
  it('maps numeric id to string id', () => {
    expect(transformInvoice(makeRaw()).id).toBe('101')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeRaw()).type).toBe('INVOICE')
  })

  it('maps number to invoiceNumber', () => {
    expect(transformInvoice(makeRaw()).invoiceNumber).toBe('INV-101')
  })

  it('maps client_id to contactId string', () => {
    expect(transformInvoice(makeRaw()).contactId).toBe('5')
  })

  it('maps total to totalAmount', () => {
    expect(transformInvoice(makeRaw()).totalAmount).toBe(11900)
  })

  it('maps total_vat to taxAmount', () => {
    expect(transformInvoice(makeRaw()).taxAmount).toBe(1900)
  })

  it('maps balance to balanceAmount', () => {
    expect(transformInvoice(makeRaw()).balanceAmount).toBe(11900)
  })

  it('maps reference', () => {
    expect(transformInvoice(makeRaw()).reference).toBe('PO-555')
  })

  it('maps invoice_date string to Date', () => {
    expect(transformInvoice(makeRaw()).postedAt).toEqual(new Date('2024-04-01'))
  })

  it('maps due_date string to Date', () => {
    expect(transformInvoice(makeRaw()).dueAt).toEqual(new Date('2024-05-01'))
  })

  it('maps sent + paid=0 to AUTHORIZED', () => {
    expect(transformInvoice(makeRaw()).status).toBe('AUTHORIZED')
  })

  it('maps sent + partial paid to PARTIALLY_PAID', () => {
    expect(transformInvoice(makeRaw({ paid: 5000 })).status).toBe('PARTIALLY_PAID')
  })

  it('maps paid to PAID', () => {
    expect(transformInvoice(makeRaw({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps cancelled to VOIDED', () => {
    expect(transformInvoice(makeRaw({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps overdue to OVERDUE', () => {
    expect(transformInvoice(makeRaw({ status: 'overdue' })).status).toBe('OVERDUE')
  })

  it('maps rows to lineItems', () => {
    const result = transformInvoice(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemDescription).toBe('Consulting')
    expect(result.lineItems![0].unitQuantity).toBe(10)
    expect(result.lineItems![0].accountId).toBe('3000')
  })

  it('passes InvoiceSchema.parse without throwing', () => {
    expect(() => InvoiceSchema.parse(transformInvoice(makeRaw()))).not.toThrow()
  })
})

describe('untransformInvoice (simplbooks)', () => {
  it('round-trips contactId back to client_id number', () => {
    const canonical = transformInvoice(makeRaw())
    const body = untransformInvoice(canonical)
    expect(body.client_id).toBe(5)
  })

  it('round-trips currency', () => {
    const canonical = transformInvoice(makeRaw())
    const body = untransformInvoice(canonical)
    expect(body.currency).toBe('EUR')
  })

  it('round-trips reference', () => {
    const canonical = transformInvoice(makeRaw())
    const body = untransformInvoice(canonical)
    expect(body.reference).toBe('PO-555')
  })

  it('round-trips notes', () => {
    const canonical = transformInvoice(makeRaw())
    const body = untransformInvoice(canonical)
    expect(body.notes).toBe('Monthly retainer')
  })
})
