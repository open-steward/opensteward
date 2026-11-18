import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type StessaInvoice,
  type StessaInvoiceItem,
} from '../../../../../../../src/verticals/accounting/adapters/stessa/transform/invoice'

function makeInvoiceItem(overrides: Partial<StessaInvoiceItem> = {}): StessaInvoiceItem {
  return {
    id: 'item-1',
    name: 'Monthly Rent',
    description: 'Unit A rent payment',
    quantity: 1,
    unitPrice: 2000,
    total: 2000,
    taxAmount: 0,
    accountId: 'acc-1',
    ...overrides,
  }
}

function makeInvoice(overrides: Partial<StessaInvoice> = {}): StessaInvoice {
  return {
    id: 'inv-001',
    invoiceNumber: 'INV-2024-001',
    contactId: 'contact-1',
    currency: 'USD',
    subtotal: 2000,
    taxAmount: 0,
    total: 2000,
    items: [],
    date: '2024-03-15',
    dueDate: '2024-04-15',
    status: 'sent',
    paidAmount: 0,
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

  it('maps contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('contact-1')
  })

  it('maps currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('USD')
  })

  it('maps total to totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(2000)
  })

  it('maps taxAmount', () => {
    expect(transformInvoice(makeInvoice({ taxAmount: 210 })).taxAmount).toBe(210)
  })

  it('maps balanceAmount as total minus paidAmount', () => {
    expect(transformInvoice(makeInvoice({ total: 2000, paidAmount: 500 })).balanceAmount).toBe(1500)
  })

  it('maps date (ISO string) to postedAt as Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-15'))
  })

  it('maps dueDate (ISO string) to dueAt as Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.dueAt).toEqual(new Date('2024-04-15'))
  })

  it('returns undefined postedAt when date is empty', () => {
    expect(transformInvoice(makeInvoice({ date: '' })).postedAt).toBeUndefined()
  })

  it('maps status DRAFT when status is draft', () => {
    expect(transformInvoice(makeInvoice({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status SUBMITTED when status is sent with no payment', () => {
    expect(transformInvoice(makeInvoice({ status: 'sent', paidAmount: 0 })).status).toBe('SUBMITTED')
  })

  it('maps status PAID when status is paid', () => {
    expect(transformInvoice(makeInvoice({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID when status is sent with partial payment', () => {
    expect(
      transformInvoice(makeInvoice({ status: 'sent', paidAmount: 500, total: 2000 })).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps status OVERDUE when status is overdue', () => {
    expect(transformInvoice(makeInvoice({ status: 'overdue' })).status).toBe('OVERDUE')
  })

  it('maps status VOIDED when status is void', () => {
    expect(transformInvoice(makeInvoice({ status: 'void' })).status).toBe('VOIDED')
  })

  it('maps items to lineItems', () => {
    const raw = makeInvoice({ items: [makeInvoiceItem()] })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('item-1')
    expect(li.itemName).toBe('Monthly Rent')
    expect(li.itemDescription).toBe('Unit A rent payment')
    expect(li.unitQuantity).toBe(1)
    expect(li.totalAmount).toBe(2000)
    expect(li.accountId).toBe('acc-1')
  })

  it('returns undefined invoiceNumber when invoiceNumber is empty', () => {
    expect(transformInvoice(makeInvoice({ invoiceNumber: '' })).invoiceNumber).toBeUndefined()
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
