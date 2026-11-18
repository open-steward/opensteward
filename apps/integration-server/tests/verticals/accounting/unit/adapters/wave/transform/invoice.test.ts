import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type WaveInvoice,
  type WaveInvoiceItem,
} from '../../../../../../../src/verticals/accounting/adapters/wave/transform/invoice'

function makeInvoiceItem(overrides: Partial<WaveInvoiceItem> = {}): WaveInvoiceItem {
  return {
    id: 'item-1',
    description: 'Premium widget',
    quantity: 2,
    unitPrice: 50,
    amount: 100,
    account: { id: 'acc-1' },
    taxes: [{ amount: 13, salesTax: { id: 'tax-1', name: 'HST', rate: 13 } }],
    ...overrides,
  }
}

function makeInvoice(overrides: Partial<WaveInvoice> = {}): WaveInvoice {
  return {
    id: 'inv-001',
    invoiceNumber: 'INV-2024-001',
    customer: { id: 'cust-1' },
    currency: { code: 'CAD' },
    totalAmount: 1130,
    taxAmount: 130,
    amountDue: 1130,
    amountPaid: 0,
    items: [],
    invoiceDate: '2024-03-15',
    dueDate: '2024-04-15',
    status: 'SENT',
    createdAt: '2024-03-15T10:00:00Z',
    modifiedAt: '2024-03-15T10:00:00Z',
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id from raw id', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('inv-001')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-2024-001')
  })

  it('maps customer.id to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('cust-1')
  })

  it('maps currency.code to currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('CAD')
  })

  it('maps totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1130)
  })

  it('maps taxAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(130)
  })

  it('maps amountDue to balanceAmount', () => {
    expect(transformInvoice(makeInvoice()).balanceAmount).toBe(1130)
  })

  it('maps amountPaid to paidAmount', () => {
    expect(transformInvoice(makeInvoice({ amountPaid: 500 })).paidAmount).toBe(500)
  })

  it('returns undefined paidAmount when amountPaid is 0', () => {
    expect(transformInvoice(makeInvoice({ amountPaid: 0 })).paidAmount).toBeUndefined()
  })

  it('maps invoiceDate to postedAt as Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-15'))
  })

  it('maps dueDate to dueAt as Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.dueAt).toEqual(new Date('2024-04-15'))
  })

  it('maps status SENT to SUBMITTED', () => {
    expect(transformInvoice(makeInvoice({ status: 'SENT' })).status).toBe('SUBMITTED')
  })

  it('maps status DRAFT to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('maps status PAID to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'PAID' })).status).toBe('PAID')
  })

  it('maps status PARTIAL to PARTIALLY_PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'PARTIAL' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status OVERDUE to OVERDUE', () => {
    expect(transformInvoice(makeInvoice({ status: 'OVERDUE' })).status).toBe('OVERDUE')
  })

  it('maps status VIEWED to SUBMITTED', () => {
    expect(transformInvoice(makeInvoice({ status: 'VIEWED' })).status).toBe('SUBMITTED')
  })

  it('maps items to lineItems', () => {
    const raw = makeInvoice({ items: [makeInvoiceItem()] })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('item-1')
    expect(li.itemDescription).toBe('Premium widget')
    expect(li.unitQuantity).toBe(2)
    expect(li.unitAmount).toBe(50)
    expect(li.totalAmount).toBe(100)
    expect(li.accountId).toBe('acc-1')
    expect(li.taxAmount).toBe(13)
  })

  it('returns undefined invoiceNumber when invoiceNumber is empty', () => {
    expect(transformInvoice(makeInvoice({ invoiceNumber: '' })).invoiceNumber).toBeUndefined()
  })

  it('returns undefined contactId when customer is null', () => {
    expect(transformInvoice(makeInvoice({ customer: null })).contactId).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
