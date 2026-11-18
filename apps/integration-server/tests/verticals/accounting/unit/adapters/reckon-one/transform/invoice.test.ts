import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type ReckonOneInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/reckon-one/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeInvoice(overrides: Partial<ReckonOneInvoice> = {}): ReckonOneInvoice {
  return {
    id: 'inv_001',
    invoiceNumber: 'INV-2024-001',
    customer: { id: 'cust_001', name: 'Widget Co' },
    date: '2024-04-01',
    dueDate: '2024-05-01',
    totalAmount: 1100.0,
    amountOwing: 1100.0,
    currency: 'AUD',
    status: 'AUTHORISED',
    notes: 'Net 30',
    lines: [
      {
        id: 'line_001',
        accountId: 'acct_rev',
        itemId: 'item_widget',
        description: 'Widget A',
        unitPrice: 100.0,
        quantity: 10,
        amount: 1000.0,
        taxAmount: 100.0,
      },
    ],
    createdDateTime: '2024-03-30T10:00:00Z',
    modifiedDateTime: '2024-04-01T08:00:00Z',
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('inv_001')
  })

  it('always sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-2024-001')
  })

  it('maps customer.id to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('cust_001')
  })

  it('maps currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('AUD')
  })

  it('converts totalAmount to minor units', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(110000)
  })

  it('converts amountOwing to balanceAmount in minor units', () => {
    expect(transformInvoice(makeInvoice()).balanceAmount).toBe(110000)
  })

  it('computes paidAmount = 0 when amountOwing === totalAmount', () => {
    expect(transformInvoice(makeInvoice()).paidAmount).toBe(0)
  })

  it('computes paidAmount correctly for partial payment', () => {
    const result = transformInvoice(makeInvoice({ amountOwing: 550.0 }))
    expect(result.paidAmount).toBe(55000)
  })

  it('maps notes', () => {
    expect(transformInvoice(makeInvoice()).notes).toBe('Net 30')
  })

  it('maps date to postedAt as Date', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toEqual(new Date('2024-04-01'))
  })

  it('maps dueDate to dueAt as Date', () => {
    expect(transformInvoice(makeInvoice()).dueAt).toEqual(new Date('2024-05-01'))
  })

  it('maps PAID status to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'PAID', amountOwing: 0 })).status).toBe('PAID')
  })

  it('maps DRAFT status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('maps VOIDED status to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'VOIDED', amountOwing: 100 })).status).toBe(
      'VOIDED',
    )
  })

  it('sets PARTIALLY_PAID when owing < total', () => {
    expect(transformInvoice(makeInvoice({ amountOwing: 550.0, totalAmount: 1100.0 })).status).toBe(
      'PARTIALLY_PAID',
    )
  })

  it('maps lines to lineItems with minor unit conversion', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0].accountId).toBe('acct_rev')
    expect(result.lineItems?.[0].itemId).toBe('item_widget')
    expect(result.lineItems?.[0].unitAmount).toBe(10000)
    expect(result.lineItems?.[0].unitQuantity).toBe(10)
    expect(result.lineItems?.[0].totalAmount).toBe(100000)
    expect(result.lineItems?.[0].taxAmount).toBe(10000)
  })

  it('passes raw object as metadata', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces output that passes InvoiceSchema validation', () => {
    expect(() => InvoiceSchema.parse(transformInvoice(makeInvoice()))).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformInvoice({ id: 'inv_001' })
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

describe('untransformInvoice', () => {
  it('round-trips invoiceNumber', () => {
    const invoice = transformInvoice(makeInvoice())
    const raw = untransformInvoice(invoice)
    expect(raw['invoiceNumber']).toBe('INV-2024-001')
  })

  it('round-trips contactId to customer.id', () => {
    const invoice = transformInvoice(makeInvoice())
    const raw = untransformInvoice(invoice)
    expect((raw['customer'] as Record<string, unknown>)['id']).toBe('cust_001')
  })

  it('converts minor unit unitAmount back to major unit unitPrice', () => {
    const invoice = transformInvoice(makeInvoice())
    const raw = untransformInvoice(invoice)
    const lines = raw['lines'] as Array<Record<string, unknown>>
    expect(lines[0]['unitPrice']).toBe(100)
  })
})
